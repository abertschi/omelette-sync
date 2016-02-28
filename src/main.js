import Watcher from './watcher.js';
import Storage from './storage.js';
import UploadQueue from './upload-queue.js';
let debug = require('debug')('bean:app');
import colors from 'colors';
import googleAuth from './google-auth.js';
import readline from 'readline';
import Q from 'Q';
import Bacon from 'baconjs';
import fs from 'fs';
import retrieveGoogleAuth from './retrieve-google-auth.js';
import GoogleDrive from './google-drive.js';

process.on('SIGINT', function() {
  Storage.setItem('lastrun', new Date());
  watcher.unwatch();
  setTimeout(function() {
    process.exit(1);
  }, 5000);
});

let lastrun = Storage.getItem('lastrun');
let lastupdate = Storage.getItem('lastupdate');
let initSuccessful = Storage.getItem('init-successful');
let init = true;

if (lastupdate) {
  lastrun = lastupdate;
}

if (lastrun && initSuccessful) {
  lastrun = new Date(lastrun);
  init = false;
  debug('Continuing work from ' + '%s'.green, lastrun);
} else {
  debug('Initializing application');
}

const WATCH_HOMEDIR = '/Users/abertschi/Dropbox/tmp';
let watcher = new Watcher({
  directory: WATCH_HOMEDIR,
  since: lastrun,
  init: init,
  type: 'fswatch'
});

watcher.on('init-done', () => {
  Storage.setItem('init-successful', new Date());
  debug('Initializing is done');
});

watcher.on('delta-done', () => {
  Storage.setItem('delta-done', new Date());
  debug('Fetching delta is done');
});

let queue = new UploadQueue();
let gDrive;

retrieveGoogleAuth().then(bundle => {

  console.log(bundle);

  gDrive = new GoogleDrive({
    watchHomeDir: WATCH_HOMEDIR,
    auth: bundle.auth
  });

  // gDrive.getFileIdByPath('/kaka')
  // .then(found => console.log('found!', found))
  // .catch(e => console.log('bean err', e));

  debug('createfolders');
  gDrive.createFolders('/bee/bar/test/bean')
  .then(found => console.log('done!', found))
  .catch(e => console.log('bean err', e));


  // watcher.watch()
  //   .onValue(change => {
  //     Storage.setItem('lastupdate', change.timestamp);
  //     debug('Change [%s]: %s %s (%s)', change.action, change.path, change.pathOrigin ? `(from ${change.pathOrigin})` : '', change.id || '-');
  //     queue.push(change);
  //   });


});





running();

let firstUpload;

function running() {
  setTimeout(function() {

      if (queue.getSize()) {
        firstUpload = false;
        let upload = queue.get();
        debug('Progressing next upload: %s %s', upload.action, upload.path);
        gDrive.upload(upload);
      }
    running();
  }, 100);
}
