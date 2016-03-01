import Watcher from './watcher.js';
import Storage from './storage.js';
import UploadQueue from './upload-queue.js';
let debug = require('debug')('bean:app');
import colors from 'colors';

import readline from 'readline';
import Q from 'Q';
import Bacon from 'baconjs';
import fs from 'fs';

import getGoogleAuthToken from './cloud/get-google-auth-token.js';
import GoogleDrive from './cloud/google-drive.js';

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

watcher.on('index-created', () => {
  Storage.setItem('init-successful', new Date());
  debug('Initializing is done');
});

watcher.on('changes-since-done', () => {
  Storage.setItem('delta-done', new Date());
  debug('Fetching delta is done');
});

let queue = new UploadQueue();
let drive;

getGoogleAuthToken().then(bundle => {

  drive = new GoogleDrive({
    auth: bundle.auth
  });

  watcher.watch();

  watcher.on('change', change => {
    Storage.setItem('lastupdate', change.timestamp);
    debug('Change [%s]: %s %s (%s)', change.action, change.path, change.pathOrigin ? `(from ${change.pathOrigin})` : '', change.id || '-');
    queue.push(change);
  });

  drive.upload('/Users/abertschi/Dropbox/tmp/haha', '/jana/test/haha')
    .then(found => console.log('done!', found))
    .catch(e => console.log('bean err', e));

});

running();

let firstUpload;

function running() {
  setTimeout(function() {

    if (queue.getSize()) {
      firstUpload = false;
      let upload = queue.get();
      debug('Progressing next upload: %s %s', upload.action, upload.path);
      //drive.upload(upload);
    }
    running();
  }, 100);
}
