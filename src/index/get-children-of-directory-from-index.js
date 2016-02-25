import Bacon from 'baconjs';
import db from '../db.js';
import path from 'path';
let debug = require('debug')('bean:index');

export default function getChildrenOfDirectoryFromIndex(dir) {
  const SQL = 'SELECT file_id, path, is_dir FROM DIRECTORY_INDEX WHERE path LIKE ? and file_id != ?';

  return Bacon.fromBinder(sink => {
    db.all(SQL, [dir.path + '%', dir.id], (err, rows) => {
      let result = new Array();
      rows.forEach(row => {
        debug('like: %s', row.path)
        if (path.dirname(row.path) == dir.path) {
          result.push({
            id: row.file_id,
            path: row.path,
            isDir: row.is_dir
          });
        }
      });
      sink(result);
    });
  });
}
