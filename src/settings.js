import db from './db.js';
import Bacon from 'baconjs';
let log = require('./debug.js')('settings');

class Settings {

  get(key) {
    const SQL = 'SELECT value from SETTINGS where key=?';
    return Bacon.fromNodeCallback(db, 'get', SQL, key)
      .flatMap(row => row && row.value ? row.value : null)
      .doAction(value => log.trace('get %s=%s', key, value))
      .toPromise();
  }

  marshall(key, value) {
    let json = JSON.stringify(value);
    return this.set(key, json);
  }

  unmarshall(key) {
    return Bacon.fromPromise(this.get(key))
      .flatMap(value => {
        if (value) {
          value = JSON.parse(value);
        }
        return value;
      }).toPromise();
  }

  set(key, value) {
    const INSERT = 'INSERT into SETTINGS (key, value) VALUES(?, ?)';
    const DELETE = 'DELETE from SETTINGS where key=?';
    return Bacon.fromPromise(this.get(key))
      .flatMap(existing => {
        if (existing) {
          return Bacon.fromNodeCallback(db, 'get', DELETE, key);
        } else {
          return;
        }
      })
      .flatMap(() => {
        return Bacon.fromNodeCallback(db, 'get', INSERT, key, value);
      })
      .doAction(() => log.trace('set %s=%s', key, value))
      .toPromise();
  }
}

export default new Settings();
