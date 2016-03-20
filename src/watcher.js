import chokidar from 'chokidar';
import fs from 'fs';
import colors from 'colors';
import Bacon from 'baconjs';
import db from './db.js';
import addToIndex from './index/add-to-index.js';
import prepareFsWatchStream from './prepare-fswatch-stream.js';
import prepareShellStream from './prepare-shell-stream.js';
import ShellWatcher from './watcher/shell-watcher.js';
import FsWatchWatcherOsx from './watcher/fswatch-watcher-osx.js';
import mergeObjects from './util/merge-objects.js';
import os from 'os';
import clientIndex from './index/client-index.js';
import EventEmitter from 'events';

import {
  createBufferdStream
} from './util/stream-helpers.js';
import {
  listChanges,
  listRecursive
} from './offline/shell-list-files.js'

let log = require('./debug.js')('watcher');

export default class Watcher extends EventEmitter {

  constructor(options = {}) {
    super();
    if (!options.directory) {
      throw new Error('Directory not set');
    }

    this.directory = this._parepareDirectory(options.directory);
    this.type = options.type || os.type();
    this.watcher = null;

    if (options.init) {
      this.indexEverything();
    } else if (options.since) {
      this.getChangesSince(options.since);
    }
  }

  indexEverything() {
    log.debug(`Creating new index for ${this.directory}`);

    clientIndex.emptyIndex().flatMap(() => {
        let stream = listRecursive(this.directory)
          .flatMap(file => {
            file.action = 'ADD';
            file.payload = file.payload ? file.payload : {};
            file.payload.isDir = file.isDir;
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
    log.debug(`Searching for changes since %s for %s`, date, this.directory);
    log.debug(date);
    listChanges(this.directory, date).flatMap(file => {
        log.debug('Detected offline change %s', file.path);
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
    log.debug('Unwatching %s', this.directory);
    if (this.watcher) {
      this.watcher.stopWatch();
    }
  }

  _enrichChange(file) {
    log.trace('Processing change %s (%s) [%s]', file.path, file.action, file.id);
    return addToIndex(file, this.directory)
      .flatMap(() => {
        log.trace('Index updated for %s', file.path);
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
      log.debug('Using ShellWatcher to observe directory changes');
      this.watcher = new ShellWatcher({
        directory: this.directory
      });

      return this.watcher.watch()
        .flatMap(file => {
          return prepareShellStream(file);
        });

    } else if (this.type == 'fswatch' || this.type == 'Darwin') {
      log.debug('Using FsWatchWatcherOsx to observe directory changes');
      this.watcher = new FsWatchWatcherOsx({
        directory: this.directory
      });

      return this.watcher.watch().flatMap(file => {
        return prepareFsWatchStream(file);
      });
    }
  }

  _parepareDirectory(dir) {
    return dir.endsWith('/') ? dir.substring(0, dir.length -1) : dir;
  }
}
