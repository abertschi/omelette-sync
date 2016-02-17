import chokidar from 'chokidar';
import getGoogleAuth from './google-auth.js';
import google from 'googleapis';
import fs from 'fs';
import dirsum from 'dirsum';
import storage from 'node-persist';
let debug = require('debug')('bean-main');

const GOOGLE_CLIENT_SECRET = './client_secret.json';

let secret = JSON.parse(fs.readFileSync(GOOGLE_CLIENT_SECRET));
let gAuth = getGoogleAuth({
  credentials: secret
});

storage.initSync();
if (!storage.getItem('firstrun')) {
  storage.setItem('firstrun', new Date().getTime());
}

process.on('S IGINT', function() {
    storage.setItem('lastrun', new Date().getTime());
    setTimeout(function() {
        process.exit(1);
    }, 5000);
});

// let start = new Date().getTime();
// debug('starting checksum ' + start);
// dirsum.digest('../engl-van2015', 'md4', function(err, hashes) {
//   if (err) throw err;
//   let end = new Date().getTime();
//   let total = (end - start) / 1000;
//   debug('ending checksum ' + end);
//   debug('total: ' + total)
//   console.log(hashes.hash);
// });

// var read = require('fs-readdir-recursive')
// var dir = '../../';
// let start = new Date().getTime();
// let date = new.Date();
// date.setDate(date.getDate() - 1).getTime();
//
// var files = read(dir)
//               .map(v => {
//                 let mtime = fs.statSync(dir + v).mtime.getTime();
//                 if (
//               })
//               .map(function(v) {
//                   return { name:v,
//                            time:
//                          };
//                })
//                .sort(function(a, b) { return a.time - b.time; })
// let end = new Date().getTime();
// //console.log(files);
// let total = (end - start) / 1000;
// debug(total);
//

// var readdirp = require('readdirp')
//   , path = require('path')
//   , es = require('event-stream');
//
// var stream = readdirp({ root: path.join(__dirname) + '/../' });
// stream
//   .on('warn', function (err) {
//     console.error('non-fatal error', err);
//     // optionally call stream.destroy() here in order to abort and cause 'close' to be emitted
//   })
//   .on('error', function (err) { console.error('fatal error', err); })
//   .on('data', d => {
//
//   });
  //.pipe(es.stringify())
  //.pipe(process.stdout);

//
// let gDrive = google.drive('v3');
// gAuth.then(auth => {
//   gDrive.files.list({
//     auth: auth,
//     pageSize: 100,
//     fields: "nextPageToken, files(id, name)"
//   }, function(err, response) {
//     if (err) {
//       console.log('The API returned an error: ' + err);
//       return;
//     }
//     var files = response.files;
//     if (files.length == 0) {
//       console.log('No files found.');
//     } else {
//       console.log('Files:');
//       for (var i = 0; i < files.length; i++) {
//         var file = files[i];
//         console.log('%s (%s)', file.name, file.id);
//       }
//     }
//   });
// });
//fs.writeFile('lastrun', '');

const spawn = require('child_process').spawn;
const rootDir = '/Users/abertschi';

const ls = spawn('find', [rootDir, '-newer', './lastrun']);

ls.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

ls.stderr.on('data', (data) => {
  console.log(`stderr: ${data}`);
});

ls.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
});
