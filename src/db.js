var sqlite3 = require('sqlite3');
let log = require('./debug.js')('db');
var fs = require('fs');
let path = require('path');

let noSchema = false;

import appData from './util/appdata-dir.js';

const DB_PATH = path.join(appData(), 'omelettesync.db');

try {
  fs.readFileSync(DB_PATH);
} catch (e) {
  noSchema = true;
}

var db = new sqlite3.Database(DB_PATH);

if (noSchema) {
  log.debug('Creating database schema at %s', DB_PATH);

  db.serialize(function() {
    db.run("CREATE TABLE CLIENT_INDEX (key TEXT, path TEXT, payload TEXT)");
    db.run("CREATE TABLE CLOUD_INDEX (provider TEXT, key TEXT, payload TEXT)");
    db.run("CREATE TABLE UPLOAD_QUEUE (action TEXT, path TEXT, json TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, active INT DEFAULT 0)");
    db.run("CREATE TABLE DOWNLOAD_QUEUE (action TEXT, path TEXT, json TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, active INT DEFAULT 0)");
    db.run("CREATE TABLE SETTINGS (key TEXT, value TEXT)");
  });
}

db.on('trace', (f) => {
  log.trace(f);
});

export default db;
