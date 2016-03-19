import GoogleDriveApi from './google-drive-api.js';
import fs from 'fs';
import Settings from './../settings.js';
import Bacon from 'baconjs';
import CloudIndex from '../index/cloud-index.js';
import detectGoogleDriveChange from './detect-google-drive-change';
let log = require('../debug.js')('gdrive');

const LAST_PAGE_TOKEN_PREFIX = 'last_page_token_';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const BACON_SEQUENTIAL_WAIT = 1000;

export default class GoogleDrive {

  constructor(options = {}) {
    this.drive = new GoogleDriveApi({
      auth: options.auth,
      mountDir: options.mountDir
    });

    this.cloudIndex = new CloudIndex();
    this._driveId;
  }

  accountId() {
    return this.drive.getUserId();
  }

  providerName() {
    return 'Google Drive';
  }

  providerImpl() {
    return this.drive;
  }

  upload(stream, location) {
    return this.drive.upload(stream, location);
  }

  postUpload(file, response) {
    log.info('postupload: ', response);
    return Bacon.fromArray(this._flattenTreeToArray(response.properties.tree))
      .flatMap(folder => {
        let payload = {
          name: folder.name,
          parentId: folder.parentId,
          md5Checksum: response.properties.md5Checksum
        };
        return this._addToIndex(folder.id, payload);
      })
      .fold(null, () => {})
      .flatMap(() => file)
      .toPromise();
  }

  download(stream, file) {
    log.trace('Downloading %s / %s', file.action, file.payload.id);
    return Promise.resolve();
  }

  postDownload(file, response) {
    return Promise.resolve();
  }

  move(sourceLocation, targetLocation) {
    return this.drive.move(sourceLocation, targetLocation);
  }

  postMove(file, response) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.get(providerId, response.properties.id)
          .flatMap(index => {
            index.parentId = response.properties.parentId;
            index.name = response.properties.name;
            return this.cloudIndex.addOrUpdate(providerId, response.properties.id, index);
          });
      }).toPromise();
  }

  remove(location) {
    return this.drive.remove(location);
    return promise;
  }

  postRemove(file, response) {
    return this._removeFromIndex(response.properties.id).toPromise();
  }

  createFolder(location) {
    return this.drive.createFolder(location);
  }

  postCreateFolder(file, response) {
    return this.postUpload(file, response);
  }

  pullChanges() {
    let pageTokenKey;
    let pageToken;

    return Bacon.fromPromise(this._getPageTokenKey())
      .flatMap(lastPageTokenKey => {
        pageTokenKey = lastPageTokenKey;
        return Bacon.fromPromise(Settings.get(lastPageTokenKey))
          .flatMap(lastPageToken => {
            return Bacon.fromPromise(this.drive.getUserId())
              .flatMap(providerId => {
                return Bacon.fromPromise(this.drive.listChanges(lastPageToken))
                  .flatMap(pull => {
                    pageToken = pull.startPageToken;
                    /*
                     * changes.reverse()
                     * do newest change last, important to handle new directories correctly
                     */
                    return Bacon.fromArray(pull.changes.reverse())
                      .flatMap(change => {
                        return detectGoogleDriveChange(change, providerId)
                          .flatMap(file => this._buildChange(change, file))
                      })
                      .flatMap(file => {
                        if (file.action == 'REMOVE') {
                          return this._removeFromIndex(file).flatMap(() => file);
                        } else {
                          return this._addToIndex(file).flatMap(() => file);
                        }
                      });
                  });
              });
          });
      })
      .fold([], (changes, change) => {
        changes.push(change);
        return changes;
      })
      .flatMap(changes => {
        Settings.set(pageTokenKey, pageToken)
        return changes;
      })
      .endOnError()
      .toPromise();
  }

  _buildChange(response, file) {
    file.isDir = this._isDir(response.mimeType),
      file.payload = {
        id: response.id,
        name: response.name,
        parentId: response.parentId,
        isDir: response.isDir,
        md5Checksum: response.md5Checksum
      }
    return file;
  }

  _removeFromIndex(fileId) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.remove(providerId, fileId);
      });
  }

  _addToIndex(fileId, payload) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.addOrUpdate(providerId, fileId, payload);
      });
  }

  _isDir(mime) {
    return mime ? mime == FOLDER_MIME_TYPE : null;
  }

  _flattenTreeToArray(tree, parentId = null, directories = []) {
    /*
     * Tree structure:
     * node =
     *   id:
     *   name:
     *   child: node
     */
    directories.push({
      id: tree.id,
      name: tree.name,
      parentId: parentId
    });
    return tree.child ? this._flattenTreeToArray(tree.child, tree.id, directories) : directories;
  }

  _getPageTokenKey() {
    return Bacon.once(this._driveId)
      .flatMap(cachedId => {
        if (!cachedId) {
          return Bacon.fromPromise(this.drive.getUserId())
            .flatMap(id => {
              this._driveId = LAST_PAGE_TOKEN_PREFIX + id;
              return this._driveId;
            })
        } else {
          return cachedId;
        }
      }).toPromise();
  }
}
