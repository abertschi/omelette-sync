import chokidar from 'chokidar';
import getGoogleAuth from './google-auth.js';
import google from 'googleapis';
import fs from 'fs';
import dirsum from 'dirsum';
import storage from 'node-persist';
import lastFileChanges from './last-file-changes.js';
import Emitter from './emitter.js';

let debug = require('debug')('bean');

const GOOGLE_CLIENT_SECRET = './client_secret.json';

storage.initSync();
if (!storage.getItem('firstrun')) {
  storage.setItem('firstrun', new Date().getTime());
}

process.on('SIGINT', function() {
  storage.setItem('lastrun', new Date().getTime());
  setTimeout(function() {
    process.exit(1);
  }, 5000);
});

getGoogleAuth({
  credentials: JSON.parse(fs.readFileSync(GOOGLE_CLIENT_SECRET))
}).then(auth => {

});

let rootDir = './';

debug('Indexing files ...');
lastFileChanges({
    rootDir: rootDir,
    lastrun: './persist/lastrun'
  })
  .then(files => {
    if (!files || files.length == 0) {
      debug('No files chaned on disk.');
    } else {
      let diskChanges = storage.getItem('diskchanges') || [];
      diskChanges = diskChanges.concat(files);
      storage.setItem('diskchanges', diskChanges);

      diskChanges.foreach(f => {
        console.log(`File change detected for $f`);
      });
    }
  });


let ready = false;
chokidar.watch(rootDir)
  .on('ready', (event, path) => ready = true)
  .on('all', (event, path) => {
    path = rootDir + path;

    if (ready) {
      switch (event) {
        case 'add':
          Emitter.emit('change-add', path);
          break;
        case 'unlink':
          Emitter.emit('change-unlink', path);
          break;
        case 'addDir':
          Emitter.emit('change-adddir', path);
          break;
        case 'unlinkDir':
          Emitter.emit('change-unlinkdir', path);
          break;
        case 'change':
          Emitter.emit('change-change', path);
          break;
        default:
      }
    }
  });

Emitter.on('change-change', payload => {
  console.log(payload);
});

wait();

function wait() {
  setTimeout(function() {
    wait();
  }, 1000);
}
