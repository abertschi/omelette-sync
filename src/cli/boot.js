import Watcher from '../watcher.js';
import colors from 'colors';
import readline from 'readline';
import Bacon from 'baconjs';
import Settings from '../settings.js';
import SyncManager from '../sync-manager.js';
import GoogleDrive from '../cloud/google-drive.js';

let log = require('../debug.js')('');

let watcher;
let lastrun;
let initDone;
let init = true;

export default function startWatching(auth, watchHome, mountDir) {

  Settings.unmarshall('lastrun')
    .then(value => lastrun = value)
    .then(() => Settings.unmarshall('initdone'))
    .then(value => initDone = value)
    .then(() => {
      log.info(initDone, lastrun);
      if (lastrun && initDone) {
        lastrun = new Date(lastrun);
        init = false;
        log.info('Continuing work from ' + '%s'.green, lastrun);
      } else {
        log.info('Initializing application');
      }
    })
    .then(() => {

      let drive = new GoogleDrive({
        auth: auth,
        mountDir: mountDir
      });

      let manager = new SyncManager({
        providers: [drive],
        watchHome: watchHome,
      });
      manager.start();

      watcher = new Watcher({
        directory: watchHome,
        since: lastrun,
        init: init
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
        log.debug('Change [%s]: %s %s (%s)', change.action, change.path, change.pathOrigin ? `(from ${change.pathOrigin})` : '', change.id || '-');
        manager.pushUpload(change);
      });
    });
}


process.on('SIGINT', function() {
  let lastrun = new Date();
  log.info('Setting lastrun to %s', lastrun);
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
