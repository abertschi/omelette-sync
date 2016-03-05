import Watcher from './watcher.js';
import Storage from './storage.js';
import UploadQueue from './upload-queue.js';
import colors from 'colors';
import readline from 'readline';
import Q from 'Q';
import Bacon from 'baconjs';
import fs from 'fs';
import SyncManager from './sync-manager.js';
import uploadQueue from './upload-queue.js';
import getGoogleAuthToken from './cloud/get-google-auth-token.js';
import GoogleDrive from './cloud/google-drive.js';

let debug = require('debug')('bean:app');

const WATCH_HOMEDIR = '/Users/abertschi/Dropbox/tmp';
let watcher;
let lastrun = Storage.getItem('lastrun');
let initDone = Storage.getItem('initdone');
let init = true;

if (lastrun && initDone) {
  lastrun = new Date(lastrun);
  init = false;
  debug('Continuing work from ' + '%s'.green, lastrun);
} else {
  debug('Initializing application');
}

getGoogleAuthToken().then(bundle => {
  debug('Got auth bundle');

  let drive = new GoogleDrive({
    auth: bundle.auth,
    basedir: '/omelettes/'
  });

  let manager = new SyncManager({
    providers: [drive],
    watchHome: WATCH_HOMEDIR
  });
  manager.start();

  watcher = new Watcher({
    directory: WATCH_HOMEDIR,
    since: lastrun,
    init: init,
    type: 'fswatch'
  });

  watcher.watch();

  watcher.on('index-created', () => {
    Storage.setItem('initdone', new Date());
    debug('Initializing is done');
  });

  watcher.on('changes-since-done', () => {
    Storage.setItem('last_offline_changes', new Date());
    debug('Fetching delta is done');
  });

  watcher.on('change', change => {
    debug('Change [%s]: %s %s (%s)', change.action, change.path, change.pathOrigin ? `(from ${change.pathOrigin})` : '', change.id || '-');
    uploadQueue.push(change);
  });
});

process.on('SIGINT', function() {
  Storage.setItem('lastrun', new Date());
  watcher.unwatch();
  setTimeout(function() {
    process.exit(1);
  }, 5000);
});

process.on('unhandledRejection', function(error, promise) {
  console.error("UNHANDLED REJECTION".red, error, error.stack);
});

keepalive();
function keepalive() {
  setTimeout(function() {
    keepalive();
  }, 10000);
}
