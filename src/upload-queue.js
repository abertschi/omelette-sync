import _db from './db.js';
var Promise = require('bluebird');
let debug = require('debug')('bean:app');

const db = Promise.promisifyAll(_db);

import EventEmitter from 'events';

export default class UploadQueue extends EventEmitter {

  constructor(init = {}) {
    super();
  }

  push(change) {
    return this._hasKey(change.action, change.path)
      .then(found => {
        if (found) {
          return;
        } else if (change.action == 'MOVE') {
          return this._hasKey(change.action, change.pathOrigin)
            .then(found => found ? this._delete(change.action, change.path) : false);
        } else if (change.action == 'REMOVE') {
          return this._deleteWithinPath(change.path);
        } else {
          return true;
        }
      })
      .then(add => {
        if (add) {
          debug('adding change %s %s to queue', change.action, change.path);
          return this._add(change.action, change.path, change);
        } else {
          return;
        }
      })
      .finally(() => {
        this._emitQueueStatus();
      });

  }

  getSize() {
    return this._size();
  }

  peek() {
    return this._getOldest()
      .then(found => {
        if (found) {
          this._setActiveFlag(found.action, found.path, true);
          return found.payload;
        } else {
          return;
        }
      });
  }

  flagAsDone(change) {
    this._delete(change.action, change.path)
    .then(this._emitQueueStatus());
  }

  pop() {
    return this._getOldest()
      .then(found => {
        if (found) {
          this.flagAsDone(found);
          return found.payload;
        } else {
          return;
        }
      });
  }

  getFlaggedAsActive() {
    const QUERY = 'SELECT action, path, json FROM UPLOAD_QUEUE where active=?'

    return db.allAsync(QUERY, [true])
      .then(rows => {
        let results = [];
        if (rows) {
          rows.forEach(row => {
            if (row.json) {
              results.push(JSON.parse(row.json));
            }
          });
        }
        return results;
      });
  }

  _hasKey(action, path) {
    const QUERY = 'SELECT action from UPLOAD_QUEUE where action=? and path=?'

    return db.getAsync(QUERY, [action, path])
      .then(result => result ? true : false);
  }

  _get(action, path) {
    const QUERY = 'SELECT json from UPLOAD_QUEUE where action=? and path=?'

    return db.getAsync(QUERY, [action, path])
      .then(result => result ? JSON.parse(result.json) : null)
      .catch(e => {
        debug(e);
        return false;
      });
  }

  _getOldest() {
    const QUERY = 'SELECT action, path, json from UPLOAD_QUEUE ORDER BY date(timestamp) DESC Limit 1'

    return db.getAsync(QUERY, [])
      .then(result => {
        if (result) {
          return {
            action: result.action,
            path: result.path,
            payload: JSON.parse(result.json)
          };
        } else {
          return null;
        }
      });
  }

  _deleteWithinPath(path) {
    const QUERY = 'DELETE FROM UPLOAD_QUEUE where path LIKE ?'

    return db.getAsync(QUERY, [`${path}%`])
      .then(result => {
        return true;
      })
      .catch(e => {
        debug(e);
        return false;
      });
  }

  _delete(action, path) {
    const QUERY = 'DELETE FROM UPLOAD_QUEUE where action=? and path=?'

    return db.getAsync(QUERY, [action, path])
      .then(result => true)
      .catch(e => {
        debug(e, e.stack);
        return false;
      });
  }

  _add(action, path, payload) {
    const QUERY = 'INSERT INTO UPLOAD_QUEUE (action, path, json) VALUES (?, ?, ?)';

    return this._hasKey(action, path)
      .then(found => {
        return found ? this._delete(action, path) : null;
      })
      .then(() => {
        return db.getAsync(QUERY, [action, path, JSON.stringify(payload)]);
      })
      .then(result => {
        return true;
      })
      .catch(e => {
        debug(e, e.stack);
        return false;
      });
  }

  _size() {
    const QUERY = 'SELECT COUNT(*) as count FROM UPLOAD_QUEUE';

    return db.getAsync(QUERY, [])
      .then(found => found.count)
    .catch(err => {
      debug(err, err.stack);
      return 0;
    })
  }

  _setActiveFlag(action, path, flag) {
    const QUERY = 'UPDATE UPLOAD_QUEUE SET active=? WHERE action=? and path=?';

    return db.getAsync(QUERY, [flag, action, path]);
  }

  _emitQueueStatus() {
    return this.getSize()
      .then(size => size == 0 ? this.emit('empty-queue') : size > 0 ? this.emit('not-empty-queue') : null);
  }
}
