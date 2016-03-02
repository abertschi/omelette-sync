import Bacon from 'baconjs';
import db from '../db.js';
let debug = require('debug')('bean:index');

const QUERY = 'SELECT is_dir, file_id, path from DIRECTORY_INDEX where path=?;';

export default function getFromIndexByPath(path) {
  return Bacon
    .fromNodeCallback(db, 'get', QUERY, path)
    .flatMap(row => {
      let result = false;
      if (row) {
        result = {};
        result.path = row.path;
        result.id = row.file_id;
        result.isDir = row.is_dir;
      }
      return result;
    });
}
