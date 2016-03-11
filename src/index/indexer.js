export default class Indexer {

  constructor() {

  }

  emptyIndex() {

  }

  _mergeObjects(obj1, obj2) {
    var obj3 = {};
    if (obj1) {
      for (let attrname in obj1) {
        obj3[attrname] = obj1[attrname];
      }
    }
    if (obj2) {
      for (let attrname in obj2) {
        obj3[attrname] = obj2[attrname];
      }
    }
    return obj3;
  }

  addOrUpdate(options = {
    clientId: null,
    cloudId: null,
    path: null,
    isDir: null,
    payload: null
  }) {

    const INSERT = 'INSERT INTO DIRECTORY_INDEX(client_id, cloud_id, path, is_dir, payload) VALUES (?, ?, ?, ?, ?)';
    const UPDATE_BY_CLIENT_ID = 'UPDATE DIRECTORY_INDEX SET path=?, payload=? WHERE client_id=?';
    const UPDATE_BY_CLOUD_ID = 'UPDATE DIRECTORY_INDEX SET path=?, payload=? WHERE cloud_id=?';

    const SELECT_BY_CLIENT_ID = 'SELECT client_id, cloud_id, path, is_dir, payload from DIRECTORY_INDEX where client_id=?'
    const SELECT_BY_CLOUD_ID = 'SELECT client_id, cloud_id, path, is_dir, payload from DIRECTORY_INDEX where cloud_id=?'

    const SELECT_FOR_PATH = 'SELECT client_id, path FROM DIRECTORY_INDEX WHERE path LIKE ?';

    return Bacon.fromBinder(sink => {
      Bacon.fromNodeCallback(db, 'get', [SELECT, id])
        .filter(row => row)
        .flatMap(row => {
          let path = options.path || row.path;
          let payload;
          let dbPayload = JSON.parse(row.payload); // todo exception
          if (options.payload) {
            payload = this._mergeObjects(options.payload, dbPayload;
          } else {
            payload = dbPayload;
          }
          return Bacon.fromNodeCallback(db, 'run', [UPDATE_BY_CLIENT_ID, id, path, JSON.stringify(payload)]);
        });



      .get(SELECT, [file.id], function(err, indexRow) {
        if (indexRow) {
          debug('check for undefined (index, file)', indexRow, file);

          db.run(UPDATE, [file.path, indexRow.client_id], () => {
            debug('Updated %s (%s)', file.path, indexRow.client_id);
            sink({
              id: indexRow.client_id,
              action: 'updated'
            });
          });

          db.all(SELECT_FOR_PATH, [file.pathOrigin + '%'], (err, rows) => {
            const PARENT_DIR_ORIGIN = file.isDir ? file.pathOrigin : path.dirname(file.pathOrigin);
            const PARENT_DIR_NEW = file.isDir ? file.path : path.dirname(file.path);

            rows.forEach(row => {
              let path = row.path.replace(PARENT_DIR_ORIGIN, PARENT_DIR_NEW);
              debug('Updating path of %s from %s to %s', row.client_id, row.path, path);

              db.run(UPDATE, [path, row.client_id], () => {
                debug('Updated %s to %s', row.client_id, path);
                sink({
                  id: row.client_id,
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

  getByPath(basedir) {

  }

  getByCloudId(id) {

  }

  getByClientId(id) {

  }

  getChildrenWithinPath(basedir) {

  }

  removeByCloudId(id) {

  }

  removeByClientId(id) {

  }

}
