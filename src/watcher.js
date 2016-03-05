import chokidar from 'chokidar';
import fs from 'fs';
import colors from 'colors';
import Bacon from 'baconjs';
import db from './db.js';
import addToIndex from './index/add-to-index.js';
import emptyIndex from './index/empty-index.js';
import prepareFsWatchStream from './prepare-fswatch-stream.js';
import prepareShellStream from './prepare-shell-stream.js';
import {
  createBufferdStream
} from './util/stream-helpers.js';
import {
  listChanges,
  listRecursive
} from './offline/shell-list-files.js'
import ShellWatcher from './watcher/shell-watcher.js';
import FsWatchWatcherOsx from './watcher/fswatch-watcher-osx.js';
import os from 'os';
import EventEmitter from 'events';

let debug = require('debug')('bean:watcher');

export default class Watcher extends EventEmitter {

  constructor(options = {}) {
    super();
    this.directory = options.directory;
    this.type = options.type || os.type();
    this.watcher = null;

    if (options.init) {
      this.indexEverything();
    } else if (options.since) {
      this.getChangesSince(options.since);
    }
  }

  indexEverything() {
    debug(`Creating new index for ${this.directory}`);
    emptyIndex().flatMap(() => {
        let stream = listRecursive(this.directory)
          .flatMap(file => {
            file.action = 'ADD';
            return file;
          });
        stream.onEnd(() => {
          this.emit('index-created');
        });
        return stream;
      })
      .flatMap(file => this._enrichChange(file))
      .onValue(file => this._emitChange(file));
  }

  getChangesSince(date) {
    debug(`Searching for changes since [%s] for ${this.directory}`, date);
    listChanges(this.directory, date).flatMap(file => {
        let shell = prepareShellStream(file);
        shell.onEnd(() => {
          this.emit('changes-since-done');
        });
        return shell;
      })
      .flatMap(file => this._enrichChange(file))
      .onValue(file => this._emitChange(file));
  }

  watch() {
    return this._getWatcherStream()
      .flatMap(file => this._enrichChange(file))
      .onValue(file => this._emitChange(file));
  }

  unwatch() {
    debug('Unwatching %s', this.directory);
    if (this.watcher) {
      this.watcher.stopWatch();
    }
  }

  _enrichChange(file) {
    debug('Processing change %s (%s) [%s]', file.path, file.action, file.id);
    return addToIndex(file, this.directory)
      .map(() => {
        debug('Index updated for %s', file.path);
        return file;
      })
      .map(file => {
        file.timestamp = new Date();
        return file;
      });
  }

  _emitChange(file) {
    let self = this;
    process.nextTick(function() {
      self.emit('change', file);
    });
  }

  _getWatcherStream() {
    if (this.type == 'Linux' || this.type == 'shell') {
      debug('Using ShellWatcher to observe directory changes');
      this.watcher = new ShellWatcher({
        directory: this.directory
      });

      return this.watcher.watch()
        .flatMap(file => {
          return prepareShellStream(file);
        });

    } else if (this.type == 'fswatch' || this.type == 'Darwin') {
      debug('Using FsWatchWatcherOsx to observe directory changes');
      this.watcher = new FsWatchWatcherOsx({
        directory: this.directory
      });

      return this.watcher.watch().flatMap(file => {
        return prepareFsWatchStream(file);
      });
    }
  }
}
