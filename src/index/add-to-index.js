import Bacon from 'baconjs';
import db from '../db.js';
import path from 'path';
let debug = require('debug')('bean:index');

export default function addToIndex(file) {
  switch (file.action) {
    case 'ADD':
    case 'MOVE':
      return addOrMove(file);
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

        db.run(UPDATE, [file.path, indexRow.file_id], () => {
          debug('Updated %s (%s)', file.path, indexRow.file_id);
          sink({
            id: indexRow.file_id,
            action: 'updated'
          });
        });

        db.all(SELECT_FOR_PATH, [file.pathOrigin + '%'], (err, rows) => {
          const PARENT_DIR_ORIGIN = file.isDir ? file.pathOrigin : path.dirname(file.pathOrigin);
          const PARENT_DIR_NEW = file.isDir ? file.path : path.dirname(file.path);

          rows.forEach(row => {
            let path = row.path.replace(PARENT_DIR_ORIGIN, PARENT_DIR_NEW);
            debug('Updating path of %s from %s to %s', row.file_id, row.path, path);

            db.run(UPDATE, [path, row.file_id], () => {
              debug('Updated %s to %s', row.file_id, path);
              sink({
                id: row.file_id,
                action: 'updated'
              });
            });
          });
        });
      } else {
        db.run(INSERT, [file.id, file.path, file.isDir], () => {
          debug('Inserted %s (%s)', file.path, file.id);
          sink({
            id: file.id,
            action: 'inserted'
          });
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
