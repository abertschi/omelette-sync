var sqlite3 = require('sqlite3');
let log = require('./debug.js')('db');
var fs = require('fs');

let noSchema = false;
const DB_PATH = './mydb.db';

try {
  fs.readFileSync(DB_PATH);
} catch (e) {
  noSchema = true;
}

var db = new sqlite3.Database(DB_PATH);

if (noSchema) {
  log.debug('Creating database schema at %s', DB_PATH);

  db.serialize(function() {
    db.run("CREATE TABLE DIRECTORY_INDEX (path TEXT, is_dir INT, file_id TEXT, payload JSON)");
    db.run("CREATE TABLE CLIENT_INDEX (key TEXT, path TEXT, payload JSON)");
    db.run("CREATE TABLE CLOUD_INDEX (provider TEXT, key TEXT, payload JSON)");
    db.run("CREATE TABLE UPLOAD_QUEUE (action TEXT, path TEXT, json JSON, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, active INT DEFAULT 0)");
    db.run("CREATE TABLE DOWNLOAD_QUEUE (action TEXT, path TEXT, json JSON, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, active INT DEFAULT 0)");
    db.run("CREATE TABLE SETTINGS (key TEXT, value TEXT)");
  });
}

db.on('trace', (f) => {
  log.trace(f);
});

export default db;
