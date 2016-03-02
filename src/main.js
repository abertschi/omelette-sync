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

process.on('unhandledRejection', function(error, promise) {
  console.error("UNHANDLED REJECTION", error.stack);
});

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
    auth: bundle.auth,
    basedir: '/omelettes/'
  });

  watcher.watch();

  watcher.on('change', change => {
    debug('Change [%s]: %s %s (%s)', change.action, change.path, change.pathOrigin ? `(from ${change.pathOrigin})` : '', change.id || '-');
    queue.push(change);
  });
});
running();

function running() {
  setTimeout(function() {
    fetching();
    running();
  }, 5000);
}


async function fetching() {
  try {
    let size = await queue.getSize();
    if (size) {
      let upload = await queue.pop();
      if (upload) {
        let target = upload.path.replace(WATCH_HOMEDIR, '');
        switch (upload.action) {
          case 'ADD':
          case 'CHANGE':
            drive.upload(upload.path, target)
              .then(done => queue.flagAsDone(upload))
            .catch(err => debug('ERR', err, err.stack));
            break;
          case 'REMOVE':
            drive.removeByPath(target)
              .then(done => queue.flagAsDone(upload))
            .catch(err => debug('ERR', err, err.stack));
            break;
          default:
        }
      }
    }
  } catch (e) {
    debug(e);
  }
}
