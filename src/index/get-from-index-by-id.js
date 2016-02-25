import Bacon from 'baconjs';
import db from '../db.js';
let debug = require('debug')('bean:index');

export default function getFromIndexById(fileId) {

  const QUERY = 'SELECT is_dir, path from DIRECTORY_INDEX where file_id=?;';
  debug('Looking up %s in index', fileId);

  return Bacon
    .fromNodeCallback(db, 'get', QUERY, fileId)
    .flatMap(row => {
      var result = false;

      if (row) {
        result = {};
        result.path = row.path;
        result.id = fileId;
        result.isDir = row.is_dir;
      }

      if (result) {
        debug('%s found in index (%s)', fileId, result.path);
      } else {
        debug('%s not found in index', fileId);
      }
      return result;
    });
}
