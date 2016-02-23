var sqlite3 = require('sqlite3');

let debug = require('debug')('bean:database');
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
  });
}

db.on('trace', (f) => {
  debug(f)
});

export default db;
