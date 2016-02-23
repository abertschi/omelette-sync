import Bacon from 'baconjs';
import db from './db.js';
import getFromIndexById from './get-from-index-by-id.js';
import getFromIndexByPath from './get-from-index-by-path.js';
import existsOnDisk from './exists-on-disk.js';
import getFileStats from './get-file-stats.js';
import {createBufferdStream} from './stream-helpers.js';

let debug = require('debug')('bean:watcher');


export default function prepareFsWatchStream(file, cache) {

  return createMetaStream(file)
    .doAction(file => {
      debug('Processing %s with Action %s', file.path, file.action);
    })
    .flatMap(file => {
      if (file.action == 'MOVE') {
        if (file.exists) {
          return getFromIndexById(file.id)
            .map(index => {
              file.pathOrigin = index.path;
              debug('Detect RENAME of %s to %s', file.pathOrigin, file.path);
              return file;
            });
        } else {
          return getFromIndexByPath(file.path)
            .map(index => { // TODO: detect move
              if (index) {
                debug('Detect REMOVE of %s', file.path);
                file.action = 'REMOVE';
                return file;
              }
            });
        }
      } else {
        debug('Detect ADD or CHANGE of %s (%s)', file.path, file.id);
        return file;
      }
    })
    .filter(f => f && f != undefined);
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
        return Bacon.once(file);
      }
    });
}
