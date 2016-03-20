import colors from 'colors';
import googleAuth from '../cloud/google-auth.js';
import readline from 'readline';
import Q from 'Q';
import Bacon from 'baconjs';
import fs from 'fs';
import Settings from '../settings.js';
let log = require('../debug.js')('gauth');

const TOKEN_KEY = 'google-drive-auth';

export default function getGoogleAuth() {

  let token = Settings.unmarshall(TOKEN_KEY);

  return Bacon.once(token)
    .flatMap((token) => {
      if (!token) {
        let url = googleAuth.generateAuthUrl();

        console.log('Authorize this app by visiting this url:'.underline + '\n', colors.green(url + '\n\n'));
        let rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        return Bacon.fromCallback(rl, 'question', 'Enter the code from that page here:'.underline)
          .flatMap(code => {
            return Bacon.fromPromise(googleAuth.getTokenByAuthCode(code));
          });
      }
      return token;
    })
    .map(token => {
      return {
        auth: googleAuth.getAuthByToken(token),
        token: token
      };
    })
    .doAction(bundle => {
      Settings.marshall(TOKEN_KEY, bundle.token);
    })
    .toPromise();
}