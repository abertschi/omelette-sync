import Bacon from 'baconjs';
import existsOnDisk from '../util/exists-on-disk.js';
import getFileStats from '../util/get-file-stats.js';
let log = require('../debug.js')('watcher');

export default function prepareFsWatchStream(file) {
  return createMetaStream(file)
    .doAction(file => {
      log.info('Processing %s with action %s', file.path, file.action);
    });
}

function createMetaStream(file) {
  return Bacon.once(file)
    .flatMap(file => {
      if (!file.payload) {
        file.payload = {};
      }
      file.payload.isDir = file.isDir;
      
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
