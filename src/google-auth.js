import chokidar from 'chokidar';
import fs from 'fs';
import google from 'googleapis';
import googleAuth from 'google-auth-library';
import readline from 'readline';
import Q from 'Q';
import async from 'async';
import colors from 'colors';

let debug = require('debug')('bean-google-auth');

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
const TOKEN_PATH = TOKEN_DIR + 'token.json';

export default function getGoogleAuth(options) {

  let credentials = options.credentials;
  let clientSecret = credentials.installed.client_secret;
  let clientId = credentials.installed.client_id;
  let redirectUrl = credentials.installed.redirect_uris[0];
  let auth = new googleAuth();
  let oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  let result = Q.defer();

  _getToken(oauth2Client)
    .then(token => {
      oauth2Client.credentials = token;
      result.resolve(oauth2Client);

    }).catch(err => result.reject(err));

  return result.promise;
}

function _getToken(oauth2Client) {
  let result = Q.defer();
  let token;

  try {
    token = fs.readFileSync(TOKEN_PATH);
  } catch (err) {}

  if (token) {
    debug('API Token on client found.');
    result.resolve(JSON.parse(token));
  } else {
    debug('No API token found. Requesting new one.');
    _getNewToken(oauth2Client)
      .then(newToken => {
        _storeToken(newToken);
        result.resolve(oauth2Client);
      })
      .catch(err => {
        console.log('Error while trying to retrieve access token', err);
        result.reject(err);
      });
  }
  return result.promise;
}

function _getNewToken(oauth2Client) {
  let authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });

  console.log('Authorize this app by visiting this url:'.underline + '\n',
    colors.green(authUrl.trim()) + '\n\n');
  let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let result = Q.defer();
  rl.question('Enter the code from that page here:'.underline, (code) => {
    rl.close();
    oauth2Client.getToken(code, (err, token) => {
      if (err) {
        result.reject(err);
      }
      else {
        result.resolve(token);
      }
    });
  });
  return result.promise;
}

function _storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (error) {
    if (error.code != 'EEXIST') {
      throw error;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
}
