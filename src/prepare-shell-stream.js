import Bacon from 'baconjs';
import db from './db.js';
import clientIndex from './index/client-index.js';
import mergeObjects from './util/merge-objects.js';

import {
  list
} from './offline/shell-list-files.js'

let log = require('./debug.js')('watcher');

export default function prepareShellStream(file) {

  return Bacon.once(file)
    .filter(file => file)
    .flatMap(file => clientIndex.get(file.id))
    .flatMap(index => {
      log.debug('Index entry for %s is %s', file.id, index ? index.path : null);
      file.payload = {};
      file.payload.isDir = file.isDir;

      if (!index) {
        file.action = 'ADD';
        log.debug('detect [%s] for %s', file.action, file.path);
        return file;
      } else if (index && !file.isDir) {
        if (file.path == index.path) {
          file.action = 'CHANGE';
          file.payload = mergeObjects(file.payload, index.payload);
          log.debug('detect [%s] for %s', file.action, file.path);
          return file;
        } else {
          file.pathOrigin = index.path;
          file.action = 'MOVE';
          file.payload = mergeObjects(file.payload, index.payload);
          log.debug('detect [%s] for %s', file.action, file.path);
          return file;
        }
      } else if (index && file.isDir) {
        log.debug('detection of [%s] unclear. Comparing with files on disk', file.path);
        return Bacon.once()
          .flatMap(() => {
            return listDirectory(file.path)
              .flatMap(fromDisk => Bacon.fromArray(fromDisk))
              .filter(fromDisk => fromDisk)
              .flatMap(diskChange => {
                return {
                  id: diskChange.id,
                  path: diskChange.path,
                  isDir: diskChange.isDir,
                  payload: {
                    isDir: diskChange.isDir
                  }
                };
              })
              .fold([], (array, change) => {
                array.push(change);
                return array;
              })
              .doAction(changes => log.trace('Quering file nodes on disk %s', changes))
              .flatMap(fromDisk => {
                return clientIndex.getChildrenWithinPath(file.path)
                  .flatMap(fromIndex => Bacon.fromArray(fromIndex))
                  .filter(change => change)
                  .flatMap(indexChange => {
                    return {
                      id: indexChange.key,
                      path: indexChange.path,
                      payload: indexChange.payload
                    };
                  })
                  .fold([], (array, change) => {
                    array.push(change);
                    return array;
                  })
                  .doAction(changes => log.trace('Quering file nodes in index %s', changes))
                  .flatMap(fromIndex => {
                    return compareDiskWithIndex(file, fromDisk, fromIndex);
                  });
              });
          });
      }
    });
}

function compareDiskWithIndex(file, fromDisk, fromIndex) {
  return Bacon.fromBinder(sink => {
    const DISK_MAP = createIdMap(fromDisk);
    const INDEX_MAP = createIdMap(fromIndex);

    fromIndex.forEach(index => {
      if (DISK_MAP.has(index.id)) {
        let disk = DISK_MAP.get(index.id);
        /*
         * Change is on disk and in index, but index has a different path.
         * Check change again to detect RENAME.
         */
        if (disk.path != index.path) {
          log.debug('detect [MOVE] for %s to %s', index.path, disk.path);
          disk.pathOrigin = index.path;
          disk.action = 'MOVE';
          disk.payload = mergeObjects(disk.payload, index.payload);
          sink(disk);
        }
      } else {
        /*
         * Change is not on disk but in index, REMOVE change from index.
         */
        log.debug('detect [REMOVE] for %s', index.path);
        sink({
          id: index.id,
          path: index.path,
          isDir: index.payload ? index.payload.isDir : null,
          action: 'REMOVE',
          payload: index.payload
        });
      }
    });

    fromDisk.forEach(disk => {
      if (!INDEX_MAP.has(disk.id)) {
        /*
         * Change is on disk but not in index, check change again so it will be ADDED.
         */
        log.debug('check for possible [ADD] of %s', disk.path);
        prepareShellStream(disk)
          .onValue(change => {
            sink(change);
          });
      }
    });
  });
}

function listDirectory(path) {
  return list(path)
    .reduce([], (array, element) => {
      if (element.path != path) {
        array.push(element);
      }
      return array;
    });
}

function createIdMap(files) {
  let map = new Map();
  files.forEach(f => map.set(f.id, f));
  return map;
}
