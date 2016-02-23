import Bacon from 'baconjs';
import db from './db.js';
let debug = require('debug')('bean:index');

export default function getFromIndexByPath(path) {

  const QUERY = 'SELECT is_dir, file_id, path from DIRECTORY_INDEX where path=?;';
  return Bacon
    .fromNodeCallback(db, 'get', QUERY, path)
    .flatMap(row => {
      var result = false;
      if (row) {
        result = {};
        result.path = row.path;
        result.id = row.file_id;
        result.isDir = row.is_dir;
      }
      if (result) {
        debug('%s found in index', path);
      } else {
        debug('%s not found in index', path);
      }
      return result;
    });
}
