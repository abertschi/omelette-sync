import chokidar from 'chokidar';
import fs from 'fs';
import google from 'googleapis';
import googleAuth from 'google-auth-library';
import readline from 'readline';
import Q from 'Q';
import async from 'async';
import colors from 'colors';

let debug = require('debug')('bean-google-auth');


//const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
//const TOKEN_PATH = TOKEN_DIR + 'token.json';

const CLIENT_SECRET = require('./../client_secret.json');
const SCOPES = ['https://www.googleapis.com/auth/drive'];

export default class GoogleAuth {

  constructor() {
    let clientSecret = CLIENT_SECRET.installed.client_secret;
    let clientId = CLIENT_SECRET.installed.client_id;
    let redirectUrl = CLIENT_SECRET.installed.redirect_uris[0];

    let auth = new googleAuth();
    this.oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
  }

  generateAuthUrl() {
    let authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES
    });
    return authUrl.trim();
  }

  generateTokenStream(code) {
    return Bacon.fromBinder(sink => {
      this.oauth2Client.getToken(code, (err, token) => {
        if (err) {
          sink(new Bacon.Error(err));
        } else {
          sink(token);
        }
      });
    });
  }

  getAuth(token = {}) {
    let auth = this.oauth2Client;
    auth.credentials = token;
    return auth;
  }

}
