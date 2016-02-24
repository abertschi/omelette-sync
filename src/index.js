import Watcher from './watcher.js';
import Storage from './storage.js';
let debug = require('debug')('bean:app');
import colors from 'colors';


process.on('SIGINT', function() {
  Storage.setItem('lastrun', new Date());
  watcher.unwatch();
  setTimeout(function() {
    process.exit(1);
  }, 5000);
});

let lastrun = Storage.getItem('lastrun');
let lastupdate = Storage.getItem('lastupdate');
let init = true;

if (lastupdate) {
  lastrun = lastupdate;
}

if (lastrun) {
  lastrun = new Date(lastrun);
  init = false;
  debug('Continuing work from ' + '%s'.green, lastrun);
} else {
  debug('Initializing application');
}

let watcher = new Watcher({
  directory: '/Users/abertschi/Dropbox',
  since: lastrun,
  init: init
});

watcher.on('init-done', () => {
  debug('Initializing is done');
});

watcher.on('delta-done', () => {
  debug('Fetching delta is done');
});

watcher.watch()
  .onValue(change => {
    Storage.setItem('lastupdate', change.timestamp);
    debug('Change [%s]: %s %s (%s)', change.action, change.path, change.pathOrigin? `(from ${change.pathOrigin})`: '', change.id || '-');
  });


running();

function running() {
  setTimeout(function() {
    running();
  }, 5000);
}
