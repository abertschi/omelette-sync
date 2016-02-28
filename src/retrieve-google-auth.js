import Watcher from './watcher.js';
import Storage from './storage.js';
import UploadQueue from './upload-queue.js';
let debug = require('debug')('bean:app');
import colors from 'colors';
import googleAuth from './google-auth.js';
import readline from 'readline';
import Q from 'Q';
import Bacon from 'baconjs';
import fs from 'fs';


const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
const TOKEN_PATH = TOKEN_DIR + 'token.json';


export default function getGoogleAuth() {

  let token;
  try {
    token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  } catch (e) {}

  let tokenBundle = {
    token: token,
    tokenDir: TOKEN_DIR,
    tokenPath: TOKEN_PATH
  }

  return Bacon.once(tokenBundle)
    .flatMap((bundle) => {
      if (!bundle.token) {
        let url = googleAuth.generateAuthUrl();

        console.log('Authorize this app by visiting this url:'.underline + '\n', colors.green(url + '\n\n'));
        let rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        return Bacon.fromCallback(rl, 'question', 'Enter the code from that page here:'.underline)
          .flatMap(code => {
            return Bacon.fromPromise(googleAuth.getTokenByAuthCode(code))
              .map(token => {
                tokenBundle.token = token;
                return tokenBundle;
              })
          });
      }
      return bundle;
    })
    .map(bundle => {
      bundle.auth = googleAuth.getAuthByToken(bundle.token);
      return bundle;
    })
    .doAction(bundle => {
      try {
        fs.mkdirSync(bundle.tokenDir);
      } catch (error) {
        if (error.code != 'EEXIST') {
          throw error;
        }
      }
      fs.writeFile(bundle.tokenPath, JSON.stringify(bundle.token));
    })
    .toPromise();
}
