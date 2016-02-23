import chokidar from 'chokidar';
import fs from 'fs';
import colors from 'colors';
import Bacon from 'baconjs';
import db from './db.js';
import addToIndex from './add-to-index.js';
import initIndex from './init-index.js';
import prepareFsWatchStream from './prepare-fswatch-stream.js';
import prepareShellStream from './prepare-shell-stream.js';
import {createBufferdStream} from './stream-helpers.js';
import {
  listChanges,
  listRecursive
} from './offline-watcher/shell-list-files.js'
import ShellWatcher from './watcher/shell-watcher.js';
import FsWatchWatcher from './watcher/fswatch-watcher.js';
import os from 'os';
import EventEmitter from 'events';

let debug = require('debug')('bean:watcher');

export default class Watcher extends EventEmitter {

  constructor(options = {}) {
    super();
    this.directory = options.directory;
    this.init = options.init || false;
    this.since = options.since;
    this.watcherName = options.watcherName || os.type();
    this.watcher = null;
  }

  watch() {
    return Bacon.once()
      .flatMap(() => {
        if (this.init) {
          debug('Creating new index ...');
          return initIndex()
            .flatMap(_ => {
              return listRecursive(this.directory)
                .flatMapLatest(file => {
                  file.action = 'ADD';
                  return file;
                })
                .onEnd(() => {
                  this.emit('init-done');
                });
            });
        } else {
          return listChanges(this.directory, this.since)
            .map(file => {
              return prepareShellStream(file)
            })
            .onEnd(() => {
              this.emit('last-changes-done');
            });
        }
      }).merge(this._getWatcherStream())
      .flatMap(file => {
        debug('Processing change %s', file.path);
        return addToIndex(file, this.directory)
          .map(() => {
            return file;
          });
      })
      .map(file => {
        file.timestamp = new Date();
        return file;
      })
  }

  _getWatcherStream() {
    if (this.watcherName == 'Linux' || this.watcherName == 'shell') {
      debug('Using ShellWatcher to observe directory changes');
      this.watcher = new ShellWatcher({
        directory: this.directory
      });

      return this.watcher.watch()
        .flatMap(file => {
          return prepareShellStream(file);
        });

    } else if(this.watcherName == 'fswatch' || this.watcherName == 'Darwin') {
      debug('Using FsWatchWatcher to observe directory changes');
      this.watcher = new FsWatchWatcher({
        directory: this.directory
      });

      let stream = this.watcher.watch();
      let cache = createBufferdStream(stream, 2);
      return stream.flatMap(file => {
          return prepareFsWatchStream(file, cache);
        });
    }
  }

  unwatch() {
    debug('Unwatching %s', this.directory);
    if (this.watcher) {
      this.watcher.stopWatch();
    }
  }
}
