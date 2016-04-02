import Watcher from '../watch/watcher.js';
import colors from 'colors';
import readline from 'readline';
import Bacon from 'baconjs';
import Settings from '../settings.js';
import SyncManager from '../sync/sync-manager.js';
import GoogleDrive from '../cloud/drive/google-drive.js';

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
      if (lastrun && initDone) {
        lastrun = new Date(lastrun);
        init = false;
        log.msg('Continuing work from ' + '%s'.green, lastrun);
      } else {
        log.msg('Creating index of your files');
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
      manager.startWatching();

      watcher = new Watcher({
        directories: [watchHome],
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
