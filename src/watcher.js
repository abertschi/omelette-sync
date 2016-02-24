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
              let stream =  listRecursive(this.directory)
                .flatMap(file => {
                  file.action = 'ADD';
                  return file;
                });
                stream.onEnd(() => {
                  this.emit('init-done');
                });
                return stream;
            });
        } else {
          return listChanges(this.directory, this.since)
            .flatMap(file => {
              let shell = prepareShellStream(file);
              shell.onEnd(() => {
                this.emit('last-changes-done');
              });
              return shell;
            })
        }
      }).doAction(f => debug(f))
      .merge(this._getWatcherStream())
      .doAction(file => {
        debug('Processing change %s', file.path);
        addToIndex(file, this.directory)
          .doAction(() => {
            debug('Index updated for %s', file.path);
          })
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

      return this.watcher.watch().flatMap(file => {
          return prepareFsWatchStream(file);
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
