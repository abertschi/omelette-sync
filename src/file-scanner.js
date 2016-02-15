import chokidar from 'chokidar';
import fs from 'fs';
import { changesSince, allFiles } from './offline-changes.js';
import watchDirectory from './online-changes.js';
import Bacon from 'baconjs';
let debug = require('debug')('bean:scanner');
import db from './db.js';
import File, { ACTIONS } from './file.js';

export default class FileScanner {

  constructor(options = {}) {
    this.directory = options.directory;
    this.init = options.init || false;
    this.since = options.since;
  }

  _addFileStats(stream) {
    return stream
      .flatMap(file => { // combine filepath with fileId using _getFileId
        return Bacon.fromBinder(sink => {
          this._getFileStats(file.path)
            .onValue(metadata => {
              file.id = metadata.id;
              file.isDir = metadata.isDir;
              sink(file);
            });
          });
        });
  }


  _createInitStream() {
    debug('Creating index of all files in directory %s', this.directory);

    return this._addFileStats(allFiles(this.directory));
  }

  _createSinceStream() {
    debug('Updating index since lastrun date %s', this.since);

    return this._addFileStats(changesSince(this.directory, this.since));

    // returns directory name if something inside directorh (not recursive) or
    // directory itself was changed
    // in case or rename -> file id is the same
    // in case of delete -> get all files in dir from index, check which one was deleted

    // eg. new folder /dir/test
    // 1. folder could have been created
    // 2. folder could have been renamed
    // 3. folder could have been moved to here
  }

  _createOnlineStream() {
    debug('Watching directory for %s changes', this.directory);

    const REMOVED = [ACTIONS.UNLINK, ACTIONS.UNLINK_DIR];
    const isRemoved = (file) => { return REMOVED.indexOf(file.action) != -1 };

    let stream = watchDirectory(this.directory);
    let removed = stream.filter(f => isRemoved(f));
    let notRemoved = this._addFileStats(stream.filter(f => !isRemoved(f)));

    return removed.merge(notRemoved);
  }

  _index(stream) {
    const QUERY = 'INSERT INTO DIRECTORY_INDEX(file_id, path) VALUES (?, ?)';
    return stream
      .doAction(file =>{
      Bacon.fromCallback(db, 'run', QUERY, [file.id, file.path])
        .onValue((nothing) => nothing); // call onValue to get response
      });
  }

  _detectFileMoved(stream) {
    const QUERY = 'SELECT path from DIRECTORY_INDEX where file_id=?';

    return stream.flatMap(file => {
        return Bacon.fromBinder(sink => {
          Bacon.fromCallback(db, 'get', QUERY, [file.id])
            .onValue((err, row) => {
              //debug(err, row);
              if (row && !err) { // TODO: bug, row is always null
                file.action = 'moved';
                file.pathFrom = row.path;
              }
              sink(file);
            });
          });
        });
  }

  _getFileStats(path) {
    return Bacon.fromNodeCallback(fs.stat, path)
      .map(stats => {
        return {
          id: stats.ino,
          isDir: stats.isDirectory()
        };
      });
  }

  watch() {
    let offlineChanges = this.init ? this._createInitStream() : this._createSinceStream();
    let onlineChanges = this._createOnlineStream();

    const MOVE_ACTIONS = [ACTIONS.ADD, ACTIONS.ADD_DIR, ACTIONS.CHANGE ];
    const isMoved = (file) => { return MOVE_ACTIONS.indexOf(file.action) != -1 };

    let movedStream = onlineChanges
      .filter(f => isMoved(f))
      .merge(offlineChanges);

    let unmovedStream = onlineChanges
      .filter(f => !isMoved(f));

    movedStream = this._detectFileMoved(movedStream);

    let changeStream = movedStream.merge(unmovedStream);
    changeStream = this._index(changeStream);


    changeStream.onValue(v => debug('Change detected! [%s]: %s (%s)', v.action, v.path, v.id));

    // offlineFiles.onEnd(v => debug('done', v));
    // offlineFiles.onError((e)=> debug('error', e));

    //changes = this._storeChanges(changes);
    //changes.onValue(v => v);
    /*
     * structure:
     * path: /full/path/to/file
     * action: delete [file/dir]
     *         create [file/dir]
     *         move [file/dir]
     */

  }

  unwatch() {}

}
