import Bacon from 'baconjs';
import db from '../db.js';
import pathUtils from 'path';
let log = require('../debug.js')('clientindex');

class ClientIndex {

  constructor() {}

  addOrUpdate(key, path, payload = {}) {
    return this.get(key)
      .flatMap(row => {
        if (row) {
          log.debug('%s existing in client-index, updating', path);
          return this._update(row, key, path, payload)
            .flatMap(() => this._updatePath(key, path, row.path))
        } else {
          log.debug('%s new in client-index, inserting', path);
          return this._insert(key, path, payload);
        }
      });
  }

  removeByPath(path) {
    log.debug('remove by path' , path);
    const SQL = 'DELETE from CLIENT_INDEX where path LIKE ?';
    return Bacon.fromNodeCallback(db, 'get', SQL, path + '%');
  }

  removeByKey(key) {
    const SQL = 'DELETE from CLIENT_INDEX where key=?';
    return Bacon.fromNodeCallback(db, 'get', SQL, key);
  }

  has(key) {
    return this.get(key).flatMap(row => row != null);
  }

  get(key) {
    const SELECT = 'SELECT key, path, payload from CLIENT_INDEX where key=?'
    return Bacon.fromNodeCallback(db, 'get', SELECT, key)
      .flatMap(row => {
        if (row) {
          return {
            payload: row.payload ? this._parseJson(row.payload) : null,
            path: row.path,
            key: row.key
          };
        }
        return;
      });
  }

  getByPath(path) {
    const SELECT = 'SELECT key, path, payload from CLIENT_INDEX where path=?'
    return Bacon.fromNodeCallback(db, 'get', SELECT, path)
      .flatMap(row => {
        if (row) {
          return {
            payload: row.payload ? this._parseJson(row.payload) : null,
            path: row.path,
            key: row.key
          };
        }
        return null;
      });
  }

  getChildrenWithinPath(path) {
    const SQL = 'SELECT key, path, payload FROM CLIENT_INDEX WHERE path LIKE ? and path!=?';

    return Bacon.fromNodeCallback(db, 'all', SQL, path + '%', path)
      .flatMap(rows => Bacon.fromArray(rows))
      .filter(row => pathUtils.dirname(row.path) == path)
      .flatMap(row => {
        return row;
      })
      .fold([], (nodes, node) => {
        nodes.push(node);
        return nodes;
      });
  }

  emptyIndex() {
    const SQL = 'DELETE FROM CLIENT_INDEX WHERE 1';
    return Bacon.fromCallback(db, 'get', SQL, []);
  }

  _insert(key, path, payload) {
    const INSERT = 'INSERT INTO CLIENT_INDEX (key, path, payload) VALUES (?, ?, ?)';
    let json = JSON.stringify(payload);

    return Bacon.fromNodeCallback(db, 'get', INSERT, key, path, json);
  }

  _update(row, key, path, payload = null) {
    const UPDATE = 'UPDATE CLIENT_INDEX SET path=? WHERE key=?';
    const UPDATE_WITH_PAYLOAD = 'UPDATE CLIENT_INDEX SET path=?, payload=? WHERE key=?';

    let newPath = path ? path : row.path;

    if (payload) {
      let newPayload = row.payload ? this._mergeObjects(row.payload, payload) : payload;
      let newPayloadJson = JSON.stringify(newPayload);
      return Bacon.fromNodeCallback(db, 'get', UPDATE_WITH_PAYLOAD, newPath, newPayloadJson, key);

    } else {
      return Bacon.fromNodeCallback(db, 'get', UPDATE, newPath, key);
    }
  }

  _updatePath(key, path, pathOrigin) {
    const SELECT_BY_PATH = 'SELECT key, path, payload FROM CLIENT_INDEX WHERE path LIKE ?';

    return Bacon.fromNodeCallback(db, 'all', SELECT_BY_PATH, pathOrigin + '%')
      .flatMap(rows => {
        if (!rows || !rows.length) {
          return;
        }
        return Bacon.fromArray(rows)
          .flatMap(row => {
            let newPath = row.path.replace(pathOrigin, path);
            return this._update(row, row.key, newPath);
          })
          .fold([], (element, array) => {});
      });
  }

  _parseJson(json) {
    try {
      return JSON.parse(json);
    } catch (err) {
      return {};
    }
  }

  _mergeObjects(base, changes) {
    if (changes) {
      for (let attrname in changes) {
        base[attrname] = changes[attrname];
      }
    }
    return base;
  }
}

export default new ClientIndex();
