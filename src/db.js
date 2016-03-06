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
    db.run("CREATE TABLE DIRECTORY_INDEX (file_id TEXT, path TEXT, is_dir INT)");
    db.run("CREATE TABLE UPLOAD_QUEUE (action TEXT, path TEXT, json TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, active INT DEFAULT 0)");
    db.run("CREATE TABLE DOWNLOAD_QUEUE (action TEXT, path TEXT, json TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, active INT DEFAULT 0)");
  });
}

db.on('trace', (f) => {
  debug(f)
});

export default db;
