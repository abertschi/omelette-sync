import db from './db.js';
import Bacon from 'baconjs';
let debug = require('debug')('bean:app');

class Settings {

  get(key) {
    const SQL = 'SELECT value from SETTINGS where key=?';
    return Bacon.fromNodeCallback(db, 'get', SQL, [key])
      .flatMap(row => row && row.value ? row.value : null)
      .doAction(value => debug('Get %s=%s', key, value))
      .toPromise();
  }

  set(key, value) {
    const INSERT = 'INSERT into SETTINGS (key, value) VALUES(?, ?)';
    const UPDATE = 'UPDATE SETTINGS set value=? where key=?';
    debug('Set %s=%s', key, value);
    return Bacon.fromPromise(this.get(key))
      .flatMap(existing => {
        if (existing) {
          return Bacon.fromNodeCallback(db, 'get', UPDATE, [value, key])
        } else {
          return Bacon.fromNodeCallback(db, 'get', INSERT, [key, value]);
        }
      })
      .toPromise();
  }
}

export default new Settings();
