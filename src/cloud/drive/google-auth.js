import chokidar from 'chokidar';
import fs from 'fs';
import google from 'googleapis';
import googleAuth from 'google-auth-library';
import readline from 'readline';
import Q from 'Q';
import async from 'async';
import colors from 'colors';

let log = require('../../debug.js')('gauth');

const CLIENT_SECRET = require('./client_secret.json');
const SCOPES = ['https://www.googleapis.com/auth/drive'];

class GoogleAuth {

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

  getTokenByAuthCode(code) {
    let result = Q.defer();
    this.oauth2Client.getToken(code, (err, token) => {
      if (err) {
        result.reject(err);
      } else {
        result.resolve(token);
      }
    });
    return result.promise;
  }

  getAuthByToken(token = {}) {
    let auth = this.oauth2Client;
    auth.setCredentials(token);
    return auth;
  }
}

export default new GoogleAuth();
