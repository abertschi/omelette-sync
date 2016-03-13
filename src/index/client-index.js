import Bacon from 'baconjs';
import db from '../db.js';
let log = require('../debug.js')('index');
import pathUtils from 'path';

class ClientIndex {

  constructor() {}

  addOrUpdate(key, path, payload = {}) {
    return this.get(key)
      .flatMap(row => {
        if (row) {
          return this._update(row, key, path, payload)
            .flatMap(() => this._updatePath(key, path, row.path));
        } else {
          return this._insert(key, path, payload);
        }
      });
  }

  removeByPath(path) {
    const SQL = 'DELETE from CLIENT_INDEX where path LIKE %s';
    return Bacon.fromNodeCallback(db, 'get', SQL, key + '%');
  }

  removeByKey(key) {
    const SQL = 'DELETE from CLIENT_INDEX where key=s';
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
    return Bacon.fromCallback(db, 'run', SQL, []);
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
      let newPayload = row.payload ? this._mergeObjects(this._parseJson(row.payload.payload), payload) : payload;
      let newPayloadJson = JSON.stringify(newPayload);
      return Bacon.fromNodeCallback(db, 'get', UPDATE_WITH_PAYLOAD, newPath, newPayloadJson, key);

    } else {
      return Bacon.fromNodeCallback(db, 'get', UPDATE, newPath, key);
    }
  }

  _updatePath(key, path, pathOrigin) {
    const SELECT_BY_PATH = 'SELECT key, path, payload FROM CLOUD_INDEX WHERE path LIKE ?';

    return Bacon.fromNodeCallback(db, 'all', SELECT_BY_PATH, pathOrigin + '%')
      .flatMap(rows => {
        let rootPathOrigin = rootNode.payload.isDir ? rootNode.path : pathUtils.dirname(rootNode.path);
        let rootPath = rootNode.payload.isDir ? path : pathUtils.dirname(path);

        return Bacon.fromArray(rows)
          .flatMap(row => {
            let newPath = row.path.replace(rootPathOrigin, rootPath);
            return this._update(row, row.key, newPath);
          });
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
