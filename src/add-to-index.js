import Bacon from 'baconjs';
import db from './db.js';
import path from 'path';
let debug = require('debug')('bean:index');

export default function addToIndex(file, rootDirectory) {
  debug('Adding %s to index ', file.path);
  switch (file.action) {
    case 'ADD':
    case 'MOVE':
      return addOrMove(file, rootDirectory);
      break;

    case 'REMOVE':
      return deleteFromIndex(file);
      break;

    case 'CHANGE':
    default:
      return Bacon.once();
  }
}

function addOrMove(file) {

  const INSERT = 'INSERT INTO DIRECTORY_INDEX(file_id, path, is_dir) VALUES (?, ?, ?)';
  const UPDATE = 'UPDATE DIRECTORY_INDEX SET path=? WHERE file_id=?';

  const SELECT = 'SELECT file_id from DIRECTORY_INDEX where file_id=?'
  const SELECT_FOR_PATH = 'SELECT file_id, path FROM DIRECTORY_INDEX WHERE path LIKE ?';

  return Bacon.fromBinder(sink => {
    db.get(SELECT, [file.id], function(err, indexRow) {
      if (indexRow) {
        debug('check for undefined (index, file)', indexRow, file);
        db.all(SELECT_FOR_PATH, [file.pathOrigin + '%'], (err, rows) => {
          const PARENT_DIR_ORIGIN = file.isDir ? file.pathOrigin : path.dirname(file.pathOrigin);
          const PARENT_DIR_NEW = file.isDir ? file.path : path.dirname(file.path);

          rows.forEach(row => {
            debug('Updating %s by changing %s to %s', row.path, PARENT_DIR_ORIGIN, PARENT_DIR_NEW);
            let path = row.path.replace(PARENT_DIR_ORIGIN, PARENT_DIR_NEW);

            db.run(UPDATE, [path, row.file_id], () => {
              debug('Updated %s (%s)', path, row.file_id);
              sink('updated');
            });
          });
        });
      } else {
        db.run(INSERT, [file.id, file.path, file.isDir], () => {
          debug('Inserted %s (%s)', file.path, file.id);
          sink('inserted');
        });
      }
    });
  });
}

function deleteFromIndex(file) {
  const REMOVE = 'DELETE FROM DIRECTORY_INDEX WHERE path LIKE ?';
  debug('Deleting %s and subdirs from index', file.path);

  db.run(REMOVE, [file.path + '%']);
  return Bacon.once();
}
