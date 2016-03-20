import Watcher from './watcher.js';
import Storage from './storage.js';
import colors from 'colors';
import readline from 'readline';
import Q from 'Q';
import Bacon from 'baconjs';
import fs from 'fs';

import SyncManager from './sync-manager.js';
import getGoogleAuthToken from './cloud/get-google-auth-token.js';
import GoogleDrive from './cloud/google-drive.js';

let log = require('./debug.js')('');

const WATCH_HOMEDIR = '/Users/abertschi/Dropbox/tmp';
let watcher;
let lastrun = Storage.getItem('lastrun');
let initDone = Storage.getItem('initdone');
let init = true;

if (lastrun && initDone) {
  lastrun = new Date(lastrun);
  init = false;
  log.info('Continuing work from ' + '%s'.green, lastrun);
} else {
  log.info('Initializing application');
}

getGoogleAuthToken().then(bundle => {
  log.trace('Got Google Auth Bundle', bundle);

  let drive = new GoogleDrive({
    auth: bundle.auth,
    mountDir: '/omelettes/'
  });

  let manager = new SyncManager({
    providers: [drive],
    watchHome: WATCH_HOMEDIR,
  });
  //manager.start();

  watcher = new Watcher({
    directory: WATCH_HOMEDIR,
    since: lastrun,
    init: false,
    type: 'fswatch'
  });

  watcher.watch();

  watcher.on('index-created', () => {
    Storage.setItem('initdone', new Date());
    log.debug('Initializing is done');
  });

  watcher.on('changes-since-done', () => {
    Storage.setItem('last_offline_changes', new Date());
    log.debug('Fetching delta is done');
  });

  watcher.on('change', change => {
    log.debug('Change [%s]: %s %s (%s)', change.action, change.path, change.pathOrigin ? `(from ${change.pathOrigin})` : '', change.id || '-');
    //manager.pushUpload(change);
  });
});

process.on('SIGINT', function() {
  let lastrun = new Date();
  log.info('Setting lastrun to %s', lastrun);
  Storage.setItem('lastrun', lastrun);
  watcher.unwatch();
  setTimeout(function() {
    process.exit(1);
  }, 5000);
});

process.on('unhandledRejection', function(error, promise) {
  log.error("UNHANDLED REJECTION".red, error, error.stack);
  throw error;
});


keepalive();
function keepalive() {
  setTimeout(function() {
    keepalive();
  }, 10000);
}
