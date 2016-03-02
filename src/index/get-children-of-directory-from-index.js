import Bacon from 'baconjs';
import db from '../db.js';
import path from 'path';
let debug = require('debug')('bean:index');

const SQL = 'SELECT file_id, path, is_dir FROM DIRECTORY_INDEX WHERE path LIKE ? and file_id != ?';

export default function getChildrenOfDirectoryFromIndex(dir) {
  return Bacon.fromBinder(sink => {
    db.all(SQL, [dir.path + '%', dir.id], (err, rows) => {
      let result = new Array();
      rows.forEach(row => {

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
