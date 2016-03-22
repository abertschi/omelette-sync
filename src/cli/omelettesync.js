#!/usr/bin/env node

var regeneratorRuntime = require('babel-regenerator-runtime');

import colors from 'colors';
import googleAuth from '../cloud/drive/google-auth.js';
import readline from 'readline';
import Bacon from 'baconjs';
import Settings from '../settings.js';
import prompt from 'prompt'
import boot from './boot.js';
import mkdirp from 'mkdirp'
import appEvents, {
  actions
} from '../events.js'
import ncp from "copy-paste";


const CLI_SETUP = 'cli-setup';
const HOME_FOLDER = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE);


var argv = require('yargs')
  .usage('Usage: $0 <command> [options]')
  .command('setup', 'Setup an account for synchronization')
  // .command('push', 'Push all local changes to cloud')
  // .command('pull', 'Pull all remote changes from cloud')
  .command('watch', 'Watch for changes and synchronize with cloud')
  .help('h')
  .alias('h', 'help')
  .boolean('event-flags')
  .alias('x', 'event-flags')
  .boolean('x', 'Print event flags')
  .default('x', true)
  .boolean('trace')
  .alias('t', 'trace')
  .default('t', false)
  .describe('t', 'Trace more implementation output')
  // .alias('m', 'monitor')
  // .describe('m', 'Manually set watch monitor implementation.')
  .demand(1)
  .strict()
  .epilog('copyright 2016 by Andrin Bertschi')
  .argv;

let command = argv._;

appEvents.on(actions.LOG_ERROR, function(namespace, msg) {
  error(namespace + ' ' + msg);
});

console.log(argv);

if (argv.trace) {
  appEvents.on(actions.LOG_ALL, function(lvl, namespace, msg) {
    if (lvl == 'msg' || lvl == 'info') {
      log(msg);
    }
  });
}

appEvents.on(actions.UPLOADING, function(file) {
  console.log('UP: %s: %s', file.action, file.path);
});

appEvents.on(actions.DOWNLOADING, function(file) {
  console.log('DOWN: %s: %s', file.action, file.path);
});

if (command == 'setup') {
  setup();

} else if (command == 'watch') {
  isSetup()
    .then(found => {
      if (!found) {
        error('No account set. Run --setup first.');
        process.exit(1);
      }
      return;
    })
    .then(() => getSetup())
    .then(setup => {
      let auth = googleAuth.getAuthByToken(setup.token);
      let watchHome = setup.watchHome;
      let mountDir = setup.mountDir;

      boot(auth, watchHome, mountDir);

    })
    .catch(err => error(err));
}

function setup() {
  prompt.message = '> '.blue;
  prompt.delimiter = ':'.grey;

  let tokenPrompt = {
    name: 'authToken',
    description: 'Authorization Token'.white,
    type: 'string',
    required: true
  };

  let clientDirPrompt = {
    name: 'client',
    description: 'Which folder do you want to synchronize with the cloud?'.white,
    type: 'string',
    required: true,
    default: HOME_FOLDER + '/omelettesync'
  }

  let cloudDirPrompt = {
    name: 'cloud',
    description: 'Where do you want to store your files in the cloud?'.white,
    type: 'string',
    required: false,
    default: '/omelettesync'
  };

  let url = googleAuth.generateAuthUrl();
  log('Setup an account'.white)
  log('Authorize omelettesync to access your Google Drive account by visiting this url:'.white)
  console.log('\n' + colors.green(url) + '\n');

  ncp.copy(url, function() {})

  prompt.get(tokenPrompt, (err, input) => {
    prompt.get([clientDirPrompt, cloudDirPrompt], (err, dirs) => {

      mkdirp(dirs.client, (err) => {
        if (err) {
          error(err);
          process.exit(1);
        } else {
          googleAuth.getTokenByAuthCode(input.authToken)
            .then(auth => {
              let prefs = {
                token: auth,
                watchHome: dirs.client,
                mountDir: dirs.cloud
              };

              saveSetup(prefs)
                .then(() => process.exit(0));

            })
            .catch(err => {
              error('Permisson rejected. Auth code wrong.');
              error(err);
              process.exit(1);
            });
        }
      });
    });
  });
}


function isSetup() {
  return Settings.get(CLI_SETUP)
    .then(got => got != null);
}

function getSetup() {
  return Settings.unmarshall(CLI_SETUP);
}

function saveSetup(setup) {
  return Settings.marshall(CLI_SETUP, setup);
}

function log(msg) {
  console.log('> '.blue, msg);
}

function error(msg) {
  console.log(colors.red(msg));
}
