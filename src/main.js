import chokidar from 'chokidar';
import getGoogleAuth from './google-auth.js';
import google from 'googleapis';
import fs from 'fs';
import dirsum from 'dirsum';
import storage from './storage';

import {changesSince, allFiles} from './offline-changes.js';
import Emitter from './emitter.js';
import FileChangeQueue from './file-change-queue.js';
import watchDirectory from './online-changes.js';
import Upload from './upload.js';
import FileScanner from './file-scanner.js';

let debug = require('debug')('bean');

const GOOGLE_CLIENT_SECRET = './../client_secret.json';

let date = new Date();
date.setDate(date.getDate() - 1);
console.log(date);
console.log(date.getTime());

let scanner = new FileScanner({
  directory: '/Users/abertschi/Dropbox',
  since: date.getTime(),
  init: true});

storage.setItem('lastrun', new Date().getTime());
process.on('SIGINT', function() {

    setTimeout(function() {
        process.exit(1);
    }, 5000);
});


scanner.watch(); 

let timeout = {};
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    //debug('TIMED OUT');
    storage.setItem('lastrun', new Date().getTime());
  }, 5000);



//et changes = allFiles('./../');
  //changes.onValue(c => debug((c)));

  wait();

  function wait() {
    setTimeout(function() {
      wait();
    }, 1000);
  }

// return;
//
// if (!storage.getItem('firstrun')) {
//   storage.setItem('firstrun', new Date().getTime());
// }
//
// let timeout = {};
// Emitter.on('update-queue', () => {
//   clearTimeout(timeout);
//   timeout = setTimeout(() => {
//     //debug('TIMED OUT');
//     storage.setItem('lastrun', new Date().getTime());
//   }, 5000);
// });
//
// getGoogleAuth({
//   credentials: JSON.parse(fs.readFileSync(GOOGLE_CLIENT_SECRET))
// }).then(auth => {
//   console.log('start');
//   console.log(FileChangeQueue);
//   let upload = new Upload({
//       auth: auth
//   });
//   upload.start();
// });
//
// let rootDir = './';
//
// debug('Indexing files ...');
// lastFileChanges({
//     rootDir: rootDir,
//     lastrun: './persist/lastrun'
//   })
//   .then(files => {
//     if (!files || files.length == 0) {
//       debug('No files chaned on disk.');
//     } else {
//       files.forEach(f => {
//         FileChangeQueue.pushChange('unknown', f);
//       });
//     }
//   });
//
//
// let ready = false;
// chokidar.watch(rootDir)
//   .on('ready', (event, path) => ready = true)
//   .on('all', (event, path) => {
//     path = rootDir + path;
//
//     if (ready) {
//       switch (event) {
//         case 'addDir':
//
//         case 'change':
//         case 'add':
//                 //console.log(fs.statSync(path));
//         case 'unlink':
//         case 'unlinkDir':
//         FileChangeQueue.pushChange(event, path);
//         // Emitter.emit('file-change', {
//         //   action: event,
//         //   path: path
//         // });
//         break;
//           break;
//         default:
//       }
//     }
//   });
