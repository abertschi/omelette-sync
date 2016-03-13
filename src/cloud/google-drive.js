import GoogleDriveApi from './google-drive-api.js';
let debug = require('debug')('bean:app');
import fs from 'fs';
import Settings from './../settings.js';
import Bacon from 'baconjs';
import CloudIndex from '../index/cloud-index.js';

const LAST_PAGE_TOKEN_PREFIX = 'last_page_token_';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

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
  }

  doUpload(file, upstream) {
    let targetPath = file.path.replace(this.watchHome, '');
    let promise;

    switch (file.action) {
      case 'ADD':
      case 'CHANGE':
        if (file.isDir) {
          promise = this.drive.createFolder(targetPath);
        } else {
          promise = this.drive.upload(upstream, targetPath);
        }
        promise = Bacon
          .fromPromise(promise)
          .flatMap(done => this._postUploadAdd(file, done).flatMap(() => done))
          .toPromise();
        break;
      case 'MOVE':
        let fromPath = file.pathOrigin.replace(this.watchHome, '');
        promise = Bacon
          .fromPromise(this.drive.move(fromPath, targetPath))
          .flatMap(done => this._postUploadMove(file, done).flatMap(() => done))
          .toPromise();
        break;
      case 'REMOVE':
        promise = Bacon
          .fromPromise(this.drive.remove(targetPath))
          .flatMap(done => this._postUploadRemove(file, done).flatMap(() => done))
          .toPromise();
        break;
      default:
        debug('Unknown change type', file);
    }
    return promise;
  }

  _postUploadAdd(file, response) {
    let transformTree = (tree, parentId = null, directories = []) => {
      directories.push({
        id: tree.id,
        name: tree.name,
        parentId: parentId
      });
      return tree.child ? transformTree(tree.child, tree.id, directories) : directories;
    };

    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return Bacon.fromArray(transformTree(response.properties.tree))
          .flatMap(folder => {
            let payload = {
              name: folder.name,
              parentId: folder.parentId
            };
            return this.cloudIndex.addOrUpdate(providerId, folder.id, payload);
          });
      })
      .fold(null, () => {})
      .flatMap(() => file);
  }

  _postUploadMove(file, response) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.get(providerId, response.properties.id)
          .flatMap(index => {
            index.parentId = response.properties.parentId;
            index.name = response.properties.name;
            return this.cloudIndex.addOrUpdate(providerId, response.properties.id, index);
          });
      });
  }

  _postUploadRemove(file, response) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.remove(providerId, response.properties.id);
      });
  }

  getProvider() {
    return this.drive;
  }

  pullChanges() {
    let pageTokenKey;
    let pageToken;

    return Bacon.fromPromise(this._getPageTokenKey())
      .flatMap(lastPageTokenKey => {
        pageTokenKey = lastPageTokenKey;
        return Bacon.fromPromise(Settings.get(lastPageTokenKey))
          .flatMap(lastPageToken => {
            return Bacon.fromPromise(this.drive.listChanges(lastPageToken))
              .flatMap(pull => {
                pageToken = pull.startPageToken;
                return Bacon.sequentially(1000, pull.changes)
                  .flatMap(change => {
                    return this._detectDownloadChange(change)
                      .flatMap(file => {
                        file.payload = {
                          id: change.id,
                          name: change.name,
                          parentId: change.parentId,
                          isDir: this._isDir(change.mimeType),
                          md5Checksum: change.md5Checksum
                        }
                        return file;
                      })
                      .flatMap(file => {
                        if (file.action == 'REMOVE') {
                          return this._removeChangeFromIndex(file).flatMap(() => file);
                        } else {
                          return this._addChangeToIndex(file).flatMap(() => file);
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
      .log()
      .toPromise();
  }

  doDownload(file) {
    debug('Downloading %s / %s', file.action, file.payload.id);
  }

  _detectDownloadChange(file) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.get(providerId, file.id)
          .flatMap(index => {
            if (!index) { // add
              return this.drive.getPathByFileId(file.id)
                .flatMap(path => {
                  file.action = 'ADD';
                  file.path = path;
                  return file;
                });
            } else {
              return this._composeNodesWithIndex(providerId, file.id)
                .flatMap(nodes => {
                  let pathOrigin = this._nodesToPath(nodes);

                  if (file.action = 'REMOVE') { // remove
                    file.path = pathOrigin;
                    return file;

                  } else if (index.parentId != file.parentId) { // move
                    return this.drive.getPathByFileId(file.id)
                      .flatMap(path => {
                        file.action = 'MOVE';
                        file.pathOrigin = pathOrigin;
                        file.path = path;
                        return file;
                      });

                  } else if (index.name != file.name) { // rename
                    file.action = 'MOVE';
                    file.pathOrigin = pathOrigin;
                    file.path = nodes.slice(nodes.length - 1) + '/' + file.name;
                    return file;

                  } else { // change
                    file.action = 'CHANGE';
                    file.path = pathOrigin;
                  }
                });
            }
          });
      });
  }

  _composeNodesWithIndex(providerId, fileId) {
    let walkToRoot = (fileId) => {
      return this.cloudIndex.get(providerId, fileId, parents = [])
        .flatMap(index => {
          if (index && index.name) {
            parents.push(index.name);
            return walkToRoot(index.parentId, parents);
          } else {
            return parents;
          }
        });
    }
    return walkToRoot(fileId).toPromise();
  }

  _nodesToPath(nodes) {
    let path = '';
    nodes.forEach(d => {
      path += '/' + d;
    });
    return path;
  }

  _removeChangeFromIndex(change) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.remove(providerId, change.id);
      });
  }

  _addChangeToIndex(change) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.addOrUpdate(providerId, change.id, change.payload);
      });
  }

  _isDir(mime) {
    return mime ? mime == FOLDER_MIME_TYPE : null;
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
}
