import Watcher from './watch/watcher.js';
import colors from 'colors';
import readline from 'readline';
import Q from 'Q';
import Bacon from 'baconjs';
import fs from 'fs';
import Settings from './settings.js';

import SyncManager from './sync/sync-manager.js';
import getGoogleAuthToken from './cli/get-google-auth-token.js';
import GoogleDrive from './cloud/google-drive.js';

let log = require('./debug.js')('');

const WATCH_HOMEDIR = '/Users/abertschi/Dropbox/tmp';
let watcher;
let lastrun;
let initDone;
let init = true;

Settings.unmarshall('lastrun')
.then(value => lastrun = value)
.then(() => Settings.unmarshall('initdone'))
.then(value => initDone = value)
.then(() => {
  if (lastrun && initDone) {
    lastrun = new Date(lastrun);
    init = false;
    log.info('Continuing work from ' + '%s'.green, lastrun);
  } else {
    log.info('Initializing application');
  }
})
.then(() => getGoogleAuthToken())
.then(bundle => {
  log.trace('Got Google Auth Bundle', bundle);

  let drive = new GoogleDrive({
    auth: bundle,
    mountDir: '/omelettes/'
  });

  let manager = new SyncManager({
    providers: [drive],
    watchHome: WATCH_HOMEDIR,
  });
  manager.startWatching();

  watcher = new Watcher({
    directory: WATCH_HOMEDIR,
    since: lastrun,
    init: init,
    type: 'shell'
  });

  watcher.watch();

  watcher.on('index-created', () => {
    Settings.marshall('initdone', new Date());
    log.debug('Initializing is done');
  });

  watcher.on('changes-since-done', () => {
    Settings.marshall('last_offline_changes', new Date());
    log.debug('Fetching delta is done');
  });

  watcher.on('change', change => {
    manager.pushUpload(change);
  });
});

process.on('SIGINT', function() {
  let lastrun = new Date();
  Settings.marshall('lastrun', lastrun);
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
