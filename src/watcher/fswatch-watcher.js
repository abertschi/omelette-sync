import childProcess from 'child_process';
import Bacon from 'baconjs';
import getFileStats from './../get-file-stats.js';
let debug = require('debug')('bean:watcher:fswatch');
var path = require('path');
import {createBufferdStream} from './../stream-helpers.js';


export default class FsWatchWatcher {

  constructor(options = {}) {
    this.directory = options.directory;
    this.watchSpawn = null;
  }

  watch() {
    const SCRIPT = __dirname + '/fswatch-watcher.sh';
    this.watchSpawn = childProcess.spawn('sh', [SCRIPT, this.directory]);

    return this._processOutput(this.watchSpawn);
  }

  stopWatch() {
    if (this.watchSpawn) {
      this.watchSpawn.stdin.pause();
      this.watchSpawn.kill();
    }
  }

  _processOutput(cmd) {

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
        debug(output);
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

        debug(file);
        return file;
      });

      let cache = createBufferdStream(results, 2);

      cache.changes()
        .flatMap(cache => {
          if (cache.length >= 2) {
            let first = cache[0];
            let last = cache[1];

            if (first.action == 'MOVE' && last.action == 'MOVE') {
              if (path.dirname(first.path) == path.dirname(last.action)) {

              }
            }
          }
        });


    let errors = Bacon
      .fromEvent(cmd.stderr, 'data')
      .map(raw => new Bacon.Error(String(raw)))
      .doAction(f => debug(f));

    return errors.merge(results);
  }
}
