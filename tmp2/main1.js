import chokidar from 'chokidar';
import getGoogleAuth from './google-auth.js';
import google from 'googleapis';
import fs from 'fs';
import dirsum from 'dirsum';
import storage from 'node-persist';
let debug = require('debug')('bean-main');

const GOOGLE_CLIENT_SECRET = './client_secret.json';

let secret = JSON.parse(fs.readFileSync(GOOGLE_CLIENT_SECRET));
let gAuth = getGoogleAuth({
  credentials: secret
});

storage.initSync();
if (!storage.getItem('firstrun')) {
  storage.setItem('firstrun', new Date().getTime());
} 

process.on('SIGINT', function() {
    storage.setItem('lastrun', new Date().getTime());
    setTimeout(function() {
        process.exit(1);
    }, 5000);
});

const spawn = require('child_process').spawn;
const rootDir = '/Users/abertschi';

const ls = spawn('find', [rootDir, '-newer', './persist/lastrun']);

ls.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

ls.stderr.on('data', (data) => {
  debug(`${data}`);
});

ls.on('close', (code) => {
  debug(`scan for changed files ended with code ${code}`);
});
