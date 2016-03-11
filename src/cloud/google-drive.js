import GoogleDriveApi from './google-drive-api.js';
let debug = require('debug')('bean:app');
import fs from 'fs';
import Settings from './../settings.js';
import Bacon from 'baconjs';

const LAST_PAGE_TOKEN_PREFIX = 'last_page_token_';

export default class GoogleDrive {

  constructor(options = {
    watchHome: null,
    mountDir: null,
    auth: null
  }) {
    this.drive = new GoogleDriveApi({
      auth: options.auth,
      mountDir: options.mountDir
    });
    this.watchHome = options.watchHome;
    this._driveId;

    let stream = fs.createWriteStream('/tmp/download.txt');
    this.drive.getStorage()
      .then(e => debug('done', JSON.stringify(e)))
      .catch(e => debug('error', e));
  }

  doUpload(file, upstream) {
    debug(file);
    let targetPath = file.path.replace(this.watchHome, '');
    let promise;

    switch (file.action) {
      case 'ADD':
      case 'CHANGE':
        if (file.isDir) {
          promise = this.drive.createFolder(targetPath);
          promise.then(done => {
            debug('INTERCEPTED THEN', done);
            return done;
          });
        } else {
          promise = this.drive.upload(upstream, targetPath);
        }
        break;
      case 'MOVE':
        let fromPath = file.pathOrigin.replace(this.watchHome, '');
        promise = this.drive.move(fromPath, targetPath);
        break;
      case 'REMOVE':
        promise = this.drive.remove(targetPath);
        break;
      default:
        debug('Unknown change type', file);
    }
    return promise;
  }

  pullChanges() {
    return Bacon.fromPromise(this._getDriveId())
      .flatMap(lastPageTokenKey => {
        return Bacon.fromPromise(Settings.get(lastPageTokenKey))
          .flatMap(lastPageToken => {
            return Bacon.fromPromise(this.drive.listChanges(lastPageToken))
              .flatMap(pull => {
                Settings.set(lastPageTokenKey, pull.startPageToken);
                return Bacon.fromArray(pull.changes)
                  .flatMap(change => {
                    debug(change);
                    return {
                      action: 'UNKNOWN',
                      id: 'unknown'
                    };
                  });
              })
          })
      })
  }

  async _getDriveId() {
    if (!this._driveId) {
      return this.drive.getUserId()
        .then(id => {
          this._driveId = LAST_PAGE_TOKEN_PREFIX + id;
          return id;
        });
    } else {
      return Bacon.once(this._driveId).toPromise();
    }
  }

  doDownload(file) {

  }

  _detectChange(change) {
    // possible changes:
    // 1. add: id is not found in index
    // 2. move: parent id does not match parentId in index
    // 3. rename: name changed
    // 4. remove: detetected by API
  }

}
