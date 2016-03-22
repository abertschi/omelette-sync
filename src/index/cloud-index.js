import Bacon from 'baconjs';
import db from '../db.js';
let log = require('../debug.js')('cloudindex');

export default class CloudIndex {

  constructor() {}

  addOrUpdate(provider, key, payload = {}) {
    log.info('addOrUpdate for %s %s %s', provider, key, payload);
    const UPDATE = 'UPDATE CLOUD_INDEX SET payload=? WHERE provider=? and key=?';
    const INSERT = 'INSERT into CLOUD_INDEX(provider, key, payload) VALUES(?, ?, ?)';

    return this.get(provider, key)
      .flatMap(stored => {
        if (stored) {
          let merged = stored ? this._mergeObjects(stored, payload) : payload;
          let json = JSON.stringify(merged);

          log.trace('updating payload from %s to %s: ', stored, merged);
          return Bacon.fromNodeCallback(db, 'get', UPDATE, json, key, provider);
        } else {
          log.trace('inserting payload %s: ', payload);
          let json = JSON.stringify(payload);
          return Bacon.fromNodeCallback(db, 'get', INSERT, provider, key, json);
        }
      });
  }

  remove(provider, key) {
    const SQL = 'DELETE from CLOUD_INDEX where provider=? and key=?';
    return Bacon.fromNodeCallback(db, 'get', SQL, provider, key);
  }

  has(provider, key) {
    return this.get(provider, key).flatMap(row => row != null);
  }

  get(provider, key) {
    const SELECT = 'SELECT payload from CLOUD_INDEX where provider=? and key=?';
    return Bacon.fromNodeCallback(db, 'get', SELECT, provider, key)
      .flatMap(row => {
        return row ? this._parseJson(row.payload) : null;
      });
  }

  _makeAccessable(object) {
    return this._parseJson(JSON.stringify(object));
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
