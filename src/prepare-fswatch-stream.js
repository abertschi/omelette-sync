import Bacon from 'baconjs';
import db from './db.js';
import getFromIndexById from './index/get-from-index-by-id.js';
import getFromIndexByPath from './index/get-from-index-by-path.js';
import existsOnDisk from './exists-on-disk.js';
import getFileStats from './get-file-stats.js';
import {createBufferdStream} from './stream-helpers.js';

let debug = require('debug')('bean:watcher');


export default function prepareFsWatchStream(file) {

  return createMetaStream(file)
    .doAction(file => {
      debug('Processing %s with Action %s', file.path, file.action);
    });
}

function createMetaStream(file) {
  return Bacon.once(file)
    .flatMap(file => {
      return existsOnDisk(file.path)
        .flatMap(exists => {
          file.exists = exists;
          return file;
        });
    })
    .flatMap(file => {
      if (file.exists) {
        return getFileStats(file.path)
          .flatMap(stats => {
            file.id = stats.id;
            return file;
          });
      } else {
        return file;
      }
    });
}
