import db from './db.js';
var Promise = require('bluebird');
import Bacon from 'baconjs';
let log = require('./debug.js')('queue');

//const db = Promise.promisifyAll(_db);

import EventEmitter from 'events';

export default class ChangeQueue extends EventEmitter {

  constructor(options = {}) {
    super();
    this.tablename = options.tablename;

    if (!this.tablename) {
      throw new Error('No tablename set');
    }
  }

  // let change = {
  //   action: 'ADD | REMOVE | MOVE | DOWNLOAD',
  //   path: '/any/path/to/file',
  //   pathOrigin: '/any/path/for/move'
  //   payload: {
  //   }
  // };
  push(change) {
    return this._hasKey(change.action, change.path)
      .filter(found => !found)
      .flatMap(found => {
        if (change.action == 'MOVE' && change.pathOrigin) {
          return this._hasKey(change.action, change.pathOrigin)
            .flatMap(found => found ? this._delete(change.action, change.pathOrigin) : false);
        } else if (change.action == 'REMOVE') {
          return this._deleteWithinPath(change.path);
        } else {
          return change;
        }
      })
      .doAction(() => log.trace('Adding change %s %s to queue', change.action, change.path))
      .flatMap(() => this._add(change.action, change.path, change))
      .onValue(() => this._emitQueueStatus());
  }

  getSize() {
    return this._size().toPromise();
  }

  peek() {
    return this._getOldest()
      .flatMap(found => {
        if (found) {
          return this._setActiveFlag(found.action, found.path, true)
            .map(() => found.payload);
        } else {
          return Bacon.once(null);
        }
      })
      .toPromise();
  }

  flagAsDone(change) {
    this._delete(change.action, change.path)
      .onValue(() => this._emitQueueStatus());
  }

  flagAsRedo(change) {
    return this._setActiveFlag(change.action, change.path, false)
      .onValue(() => this._emitQueueStatus());
  }

  pop() {
    return this._getOldest()
      .map(found => {
        if (found) {
          this.flagAsDone(found)
          return found.payload;
        } else {
          return null;
        }
      })
      .toPromise();
  }

  getFlaggedAsActive() {
    const QUERY = `SELECT action, path, json FROM ${this.tablename} where active=?`

    return Bacon.fromNodeCallback(db, `all`, QUERY, [true])
      .flatMap(rows => {
        return Bacon.fromArray(rows)
          .filter(row => row);
      })
      .map(row => JSON.parse(row.json))
      .fold([], (array, active) => {
        array.push(active);
        return array;
      }).toPromise();
  }

  _hasKey(action, path) {
    const QUERY = `SELECT action from ${this.tablename} where action=? and path=?`

    return Bacon.fromNodeCallback(db, `get`, QUERY, [action, path])
      .map(row => row ? true : false);
  }

  _get(action, path) {
    const QUERY = `SELECT json from ${this.tablename} where action=? and path=?`

    return Bacon.fromNodeCallback(db, `get`, QUERY, [action, path])
      .map(row => row ? JSON.parse(row.json) : null);
  }

  _getOldest() {
    const QUERY = `SELECT action, path, json from ${this.tablename} WHERE active=? ORDER BY date(timestamp) DESC Limit 1`

    return Bacon.fromNodeCallback(db, `get`, QUERY, [0])
      .map(row => {
        if (row) {
          return {
            action: row.action,
            path: row.path,
            payload: JSON.parse(row.json)
          };
        } else {
          return null;
        }
      });
  }

  _deleteWithinPath(path) {
    const QUERY = `DELETE FROM ${this.tablename} where path LIKE ?`

    return Bacon.fromNodeCallback(db, `get`, QUERY, [`${path}%`])
      .map(row => row ? true : false);
  }

  _delete(action, path) {
    const QUERY = `DELETE FROM ${this.tablename} where action=? and path=?`

    return Bacon.fromNodeCallback(db, `get`, QUERY, [action, path])
      .map(row => row ? true : false);
  }

  _add(action, path, payload = {}) {
    const QUERY = `INSERT INTO ${this.tablename} (action, path, json) VALUES (?, ?, ?)`;

    return this._hasKey(action, path)
      .flatMap(found => found ? this._delete(action, path) : null)
      .flatMap(() => Bacon.fromNodeCallback(db, `get`, QUERY, [action, path, JSON.stringify(payload)]))
      .map(() => true);
  }

  _size() {
    const QUERY = `SELECT COUNT(*) as count FROM ${this.tablename}`;

    return Bacon.fromNodeCallback(db, `get`, QUERY, [])
      .map(found => found.count);
  }

  _setActiveFlag(action, path, flag) {
    const QUERY = `UPDATE ${this.tablename} SET active=? WHERE action=? and path=?`;

    return Bacon.fromNodeCallback(db, `get`, QUERY, [flag, action, path]);
  }

  _emitQueueStatus() {
    return this.getSize()
      .then(size => {
        let emit = size == 0 ? `empty` : `not-empty`;
        this.emit(emit);
      });
  }
}
