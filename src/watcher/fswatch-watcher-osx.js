import childProcess from 'child_process';
import Bacon from 'baconjs';
import getFileStats from './../util/get-file-stats.js';
let debug = require('debug')('bean:watcher:fswatch');
let trace = require('debug')('bean:watcher:trace');
var path = require('path');
import {
  createBufferdStream
} from './../util/stream-helpers.js';
import username from 'username';


export default class FsWatchWatcherOsx {

  constructor(options = {}) {
    if (!options.directory) {
      throw new Error('Directory not specified');
    }

    this.directory = options.directory;
    this.watchSpawn = null;
  }

  watch() {
    const dir = '/'
    const SCRIPT = __dirname + '/fswatch-watcher.sh';
    this.watchSpawn = childProcess.spawn('sh', [SCRIPT, dir]);

    return Bacon.fromPromise(username())
      .flatMap(username => {
        return this._processOutput(this.watchSpawn, username);
      })
  }

  stopWatch() {
    if (this.watchSpawn) {
      this.watchSpawn.stdin.pause();
      this.watchSpawn.kill();
    }
  }

  _processOutput(cmd, username) {

    const TRASH = `/Users/${username}/.Trash`;
    let isTrash = (raw) => {
      return raw.indexOf(TRASH) > -1 ? true : false;
    }

    let isInDirectory = (raw) => {
      return (raw.indexOf(this.directory) > -1);
    };

    let isRelevant = (raw) => {
      if (isInDirectory(raw)) return true;
      else if (isTrash(raw)) return true;
      else return false;
    }

    let results = Bacon
      .fromEvent(cmd.stdout, 'data')
      .map(raw => String(raw))
      .flatMap(founds => Bacon.fromArray(founds.split('\n')))
      .filter(f => f.trim() != '')
      .flatMap(output => {
        trace(output);

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

    let cache = createBufferdStream(results, 2);

    let moveStream = cache.changes()
      .flatMap(cache => {
        if (cache.length >= 2) {
          let source = cache[0]; // move from event
          let target = cache[1]; // move to event

          if (source.action == 'MOVE' && target.action == 'MOVE') {
            if (isInDirectory(source.path)) {
              if (isTrash(target.path)) {
                debug('Detect MOVE to trash of %s (to %s)', source.path, target.path);
                source.action = 'REMOVE';
                return source;
              } else if (path.basename(source.path) == path.basename(target.path) || path.dirname(source.path) == path.dirname(target.path)) {
                if (isInDirectory(target.path)) {
                  debug('Detect MOVE within watched directory [%s to %s]', source.path, target.path);
                  target.pathOrigin = source.path;
                  return target;
                } else {
                  debug('Detect MOVE out of watched directory [%s to %s]', source.path, target.path);
                  source.action = 'REMOVE';
                  return source;
                }
              }
            } else if (isInDirectory(target.path)) {
              if (path.basename(source.path) == path.basename(target.path) || path.dirname(source.path) == path.dirname(target.path)) {
                debug('Detect ADD of file moved to watched directory [%s to %s]', source.path, target.path);
                target.action = 'ADD';
                return target;
              }
            }
          }
        }
      }).filter(f => f != undefined);

    results = results
      .filter(f => f.action != 'MOVE')
      .filter(f => isInDirectory(f.path));

    let errors = Bacon
      .fromEvent(cmd.stderr, 'data')
      .map(raw => new Bacon.Error(String(raw)))
      .doAction(f => debug(f));

    return results.merge(moveStream).merge(errors);
  }
}
