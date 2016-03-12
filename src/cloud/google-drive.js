import GoogleDriveApi from './google-drive-api.js';
let debug = require('debug')('bean:app');
import fs from 'fs';
import Settings from './../settings.js';
import Bacon from 'baconjs';
import CloudIndex from '../index/cloud-index.js';

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
    this.cloudIndex = new CloudIndex();

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
    return Bacon.fromPromise(this._getPageTokenKey())
      .flatMap(lastPageTokenKey => {
        return Bacon.fromPromise(Settings.get(lastPageTokenKey))
          .flatMap(lastPageToken => {
            return Bacon.fromPromise(this.drive.listChanges(lastPageToken))
              .flatMap(pull => {
                //Settings.set(lastPageTokenKey, pull.startPageToken);
                return Bacon.fromArray(pull.changes)
                  .flatMap(change => {
                    if (change.action != 'REMOVE') {
                      return this._detectChange(change)
                        .flatMap(change => {
                          return this._addOrUpdate(change)
                            .flatMap(() => change);
                        })
                    } else {
                      return this._prepareRemove(change);
                    }
                  })
              })
          })
      })
  }

  _remove(change) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.remove(providerId, change.id);
      });
  }

  _addOrUpdate(change) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.addOrUpdate(providerId, change.id, change.payload);
      });
  }

  _prepareRemove(change) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.get(providerId, change.id)
          .flatMap(index => {
            return this.cloudIndex.get(providerId, index.parentId)
              .flatMap(parentIndex => {
                return Bacon.fromPromise(this.drive.getPathByFileId())
              })
          });
      });
  }

  _detectChange(change) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
          return this.cloudIndex.get(providerId, change.id)
            .flatMap(index => {
                change.payload = {};
                if (!index) {
                  change.action = 'ADD';
                  change.payload = {
                    id: change.id,
                    name: change.name,
                    parentId: change.parentId,
                    md5Checksum: change.md5Checksum
                  };
                } else {
                  if (index.parentId != change.parentId) {
                    change.payload.parentId = change.parentId;
                    change.payload.parentIdOrigin = index.parentId;
                  }
                  if (index.name != change.name) {
                    change.payload.name = change.name;
                  }
                  if (index.md5Checksum != change.md5Checksum) {
                    change.action = 'CHANGE';
                    change.payload.md5Checksum = change.md5Checksum;
                  } else {
                    change.action = 'MOVE';
                  }
                  return change;
                });
            });
      }
  }

  async _getPageTokenKey() {
    if (!this._driveId) {
      return this.drive.getUserId()
        .then(id => {
          this._driveId = LAST_PAGE_TOKEN_PREFIX + id;
          return this._driveId;
        });
    } else {
      return Bacon.once(this._driveId).toPromise();
    }
  }

  doDownload(file) {

  }
}
