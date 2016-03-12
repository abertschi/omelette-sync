import db from './db.js';
import Bacon from 'baconjs';

class Settings {

  get(key) {
    const SQL = 'SELECT value from SETTINGS where key=?';
    return Bacon.fromNodeCallback(db, 'get', SQL, [key])
      .flatMap(row => row ? row.value || null: null)
      .toPromise();
  }

  set(key, value) {
    const INSERT = 'INSERT into SETTINGS (key, value) VALUES(?, ?)';
    const UPDATE = 'UPDATE SETTINGS set value=? where key=?';
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
