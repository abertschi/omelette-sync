import Bacon from 'baconjs';
import db from './db.js';
import getFromIndexById from './index/get-from-index-by-id.js';
import getChildrenOfDirectoryFromIndex from './index/get-children-of-directory-from-index.js';
import {list} from './offline/shell-list-files.js'

let debug = require('debug')('bean:watcher');

export default function prepareShellStream(file) {

  return getFromIndexById(file.id)
    .flatMap(index => {
      if (!index) {
        file.action = 'ADD';
        debug('detect [%s] for %s', file.action, file.path);
        return file;
      } else if (index && !file.isDir) {
        if (file.path == index.path) {
          file.action = 'CHANGE';
          debug('detect [%s] for %s', file.action, file.path);
          return file;
        } else {
          file.pathOrigin = index.path;
          file.action = 'MOVE';
          debug('detect [%s] for %s', file.action, file.path);
          return file;
        }
      } else if (index && file.isDir) {
        return Bacon.once()
          .flatMap(() => {
            return listDirectory(file.path)
              .flatMap((fromDisk) => {
                return getChildrenOfDirectoryFromIndex(file)
                  .flatMap(fromIndex => {
                    return compareDiskWithIndex(file, fromDisk, fromIndex);
                  });
              });
          });
      }
    });
}

function compareDiskWithIndex(file, fromDisk, fromIndex) {

  return Bacon.fromBinder(function(sink) {
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
          debug('detect [MOVE] for %s to %s', index.path, disk.path);
          disk.pathOrigin = index.path;
          disk.action = 'MOVE';
          sink(disk);
        }
      } else {
        /*
         * Change is not on disk but in index, REMOVE change from index.
         */
        debug('detect [REMOVE] for %s', index.path);
        sink({
          id: index.id,
          path: index.path,
          action: 'REMOVE'
        });
      }
    });

    fromDisk.forEach(disk => {
      if (!INDEX_MAP.has(disk.id)) {
        /*
         * Change is on disk but not in index, check change again so it will be ADDED.
         */
        debug('check for possible [ADD] of %s', disk.path);
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
