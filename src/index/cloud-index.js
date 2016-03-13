import Bacon from 'baconjs';
import db from '../db.js';
let debug = require('debug')('bean:app');

export default class CloudIndex {

  constructor() {}

  addOrUpdate(provider, key, payload = {}) {
    const SELECT = 'SELECT payload from CLOUD_INDEX where provider=? and key=?';
    const UPDATE = 'UPDATE CLOUD_INDEX SET payload=? WHERE provider=? and key=?';
    const INSERT = 'INSERT into CLOUD_INDEX(provider, key, payload) VALUES(?, ?, ?)';

    return this.get(provider, key)
      .flatMap(row => {
        if (row) {
          let load = row.payload ? this._mergeObjects(this._parseJson(row.payload.payload), payload) : payload;
          let json = JSON.stringify(load);
          //debug('Updating payload from %s to %s: ', JSON.stringify(row.payload), json);
          return Bacon.fromNodeCallback(db, 'get', UPDATE, json, key, provider);
        } else {
          //debug('Inserting payload %s: ', JSON.stringify(payload));
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
    return this.get().flatMap(row => row != null);
  }

  get(provider, key) {
    const SELECT = 'SELECT payload from CLOUD_INDEX where provider=? and key=?';
    return Bacon.fromNodeCallback(db, 'get', SELECT, provider, key)
      .flatMap(row => {
        return row && row.payload ? this._parseJson(row.payload) : null;
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
