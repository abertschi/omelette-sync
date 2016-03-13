var sqlite3 = require('sqlite3');

let debug = require('debug')('bean:app');
var fs = require('fs');

let noSchema = false;

try {
  fs.readFileSync('./mydb.db');
} catch (e) {
  noSchema = true;
}

var db = new sqlite3.Database('./mydb.db');

if (noSchema) {
  db.serialize(function() {
    db.run("CREATE TABLE DIRECTORY_INDEX (path TEXT, is_dir INT, file_id TEXT, payload JSON)");
    db.run("CREATE TABLE CLOUD_INDEX (provider TEXT, key TEXT, payload JSON)");
    db.run("CREATE TABLE UPLOAD_QUEUE (action TEXT, path TEXT, json JSON, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, active INT DEFAULT 0)");
    db.run("CREATE TABLE DOWNLOAD_QUEUE (action TEXT, path TEXT, json JSON, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, active INT DEFAULT 0)");
    db.run("CREATE TABLE SETTINGS (key TEXT, value TEXT)");
  });
}

db.on('trace', (f) => {
  //debug(f)
});

export default db;
