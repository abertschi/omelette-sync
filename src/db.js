var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('./mydb.db');
let debug = require('debug')('bean:db');
// db.serialize(function() {
//   db.run("CREATE TABLE DIRECTORY_INDEX (file_id TEXT, path TEXT, is_dir INT)");
// });

db.on('trace', (f) => debug(f));

export default db;
