import Bacon from 'baconjs';
import db from '../db.js';
let debug = require('debug')('bean:index');

const QUERY = 'SELECT is_dir, path from DIRECTORY_INDEX where client_id=?;';

export default function getFromIndexById(fileId) {
  return Bacon
    .fromNodeCallback(db, 'get', QUERY, fileId)
    .flatMap(row => {
      let result = false;
      if (row) {
        result = {};
        result.path = row.path;
        result.id = fileId;
        result.isDir = row.is_dir;
      }
      return result;
    });
}
