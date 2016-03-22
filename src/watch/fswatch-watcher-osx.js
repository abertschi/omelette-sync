import childProcess from 'child_process';
import Bacon from 'baconjs';
import getFileStats from './../util/get-file-stats.js';
import username from 'username';
import {
  createBufferdStream
} from './../util/stream-helpers.js';

let log = require('../debug.js')('watcher');
var path = require('path');

export default class FsWatchWatcherOsx {

  constructor(options = {}) {
    if (!options.directory) {
      throw new Error('Directory not specified');
    }
    this.directory = options.directory;
    this.watchSpawn = null;
    this._username = null;
  }

  watch() {
    const dir = '/'
    const SCRIPT = __dirname + '/fswatch-watcher.sh';
    this.watchSpawn = childProcess.spawn('sh', [SCRIPT, dir]);

    return Bacon.fromPromise(username())
      .flatMap(username => {
        this._username = username;
        return this._processOutput(this.watchSpawn);
      })
  }

  stopWatch() {
    if (this.watchSpawn) {
      this.watchSpawn.stdin.pause();
      this.watchSpawn.kill();
    }
  }

  _processOutput(cmd) {
    let results = Bacon
      .fromEvent(cmd.stdout, 'data')
      .map(raw => String(raw))
      .flatMap(founds => Bacon.fromArray(founds.split('\n')))
      .filter(f => f.trim() != '')
      .flatMap(output => {

        const PATH_SEPARATOR = output.lastIndexOf(' ');
        let path = output.substring(0, PATH_SEPARATOR);
        let flags = [];
        output.substring(PATH_SEPARATOR).split('#').forEach(f => {
          flags.push(f.trim());
        });
        let isDir = flags.indexOf('IsDir') > -1;
        let file = {
          isDir: isDir,
          path: path
        };

        if (flags.indexOf('Removed') > -1) file.action = 'REMOVE';
        else if (flags.indexOf('Renamed') > -1) file.action = 'MOVE';
        else if (flags.indexOf('Created') > -1) file.action = 'ADD';
        else {
          file.action = 'ADD'; // treat a CHANGE as an ADD
        }
        return file;
      });

    let moveStream = this._createMoveStream(createBufferdStream(results, 2));
    results = results
      .filter(f => f.action != 'MOVE')
      .filter(f => this._isInDirectory(f.path))
      .doAction(f => log.info('fswatch: %s', f));

    let errors = Bacon
      .fromEvent(cmd.stderr, 'data')
      .map(raw => new Bacon.Error(String(raw)))
      .doAction(f => log.error(f));

    return results.merge(moveStream).merge(errors);
  }

  _createMoveStream(stream) {
    return stream.changes()
      .flatMap(cache => {
        if (cache.length >= 2) {
          let source = cache[0]; // move from event
          let target = cache[1]; // move to event

          if (source.action == 'MOVE' && target.action == 'MOVE') {
            if (this._isInDirectory(source.path)) {
              if (this._isTrash(target.path)) {
                log.trace('Detect MOVE to trash of %s (to %s)', source.path, target.path);

                source.action = 'REMOVE';
                return source;
              } else if (path.basename(source.path) == path.basename(target.path) || path.dirname(source.path) == path.dirname(target.path)) {
                if (this._isInDirectory(target.path)) {
                  log.trace('Detect MOVE within watched directory [%s to %s]', source.path, target.path);

                  target.pathOrigin = source.path;
                  return target;
                } else {
                  log.trace('Detect MOVE out of watched directory [%s to %s]', source.path, target.path);

                  source.action = 'REMOVE';
                  return source;
                }
              }
            } else if (this._isInDirectory(target.path)) {
              if (path.basename(source.path) == path.basename(target.path) || path.dirname(source.path) == path.dirname(target.path)) {
                log.trace('Detect ADD of file moved to watched directory [%s to %s]', source.path, target.path);

                target.action = 'ADD';
                return target;
              }
            }
          }
        }
      }).filter(f => f != undefined);
  }

  _isTrash(location) {
    const TRASH = `/Users/${this._username}/.Trash`;
    return location.indexOf(TRASH) > -1 ? true : false;
  }

  _isInDirectory(location) {
    return (location.indexOf(this.directory) > -1);
  }

  _isRelevant(raw) {
    if (this._isInDirectory(raw)) return true;
    else if (this._isTrash(raw)) return true;
    else return false;
  }
}
