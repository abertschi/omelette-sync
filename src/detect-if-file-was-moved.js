import Bacon from 'baconjs';
import fs from 'fs';

var db;
export default function detectIfFileWasMoved(fileId, _db) {

  db = _db;
  const QUERY = 'SELECT path from DIRECTORY_INDEX where file_id=?';
  console.log(db);
  return Bacon.fromBinder(sink => {
    db.get(QUERY, [fileId], function(err, row) {
      let result = {
        wasMoved: false,
        pathOrigin: null
      };

      if (row && !err) { // TODO: bug, row is always null
        result.wasMoved = true;
        result.pathOrigin = row.path;
      }

      console.log(result);
      sink(result);

    });
  });
}
