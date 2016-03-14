import GoogleDriveApi from './google-drive-api.js';
import fs from 'fs';
import Settings from './../settings.js';
import Bacon from 'baconjs';
import CloudIndex from '../index/cloud-index.js';
let log = require('../debug.js')('gdrive');

const LAST_PAGE_TOKEN_PREFIX = 'last_page_token_';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const BACON_SEQUENTIAL_WAIT = 1000;

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
        log.debug('Unknown change type', file);
    }
    return promise;
  }

  _postUploadAdd(file, response) {
    log.debug(response);
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
                return Bacon.sequentially(BACON_SEQUENTIAL_WAIT, pull.changes.reverse())
                  // changes.reverse(): do newest change last, important to handle new directories correctly
                  .flatMap(change => {
                    log.debug('Detecting download change for %s', change);
                    return this._detectDownloadChange(change)
                      .flatMap(file => {
                        log.trace('Change detected: %s', file);
                        file.isDir = this._isDir(change.mimeType), // required by sync manager

                        file.payload = {
                          id: change.id,
                          name: change.name,
                          parentId: change.parentId,
                          isDir: file.isDir,
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
      .toPromise();
  }

  doDownload(file, stream) {
    log.debug('Downloading %s / %s', file.action, file.payload.id);
  }

  // TODO: bug:   bean:app Moving /omelettes/bean/hi/Kopie von Untitled 2.pgn to /1.pgn +0ms
  // TODO: bug: Moving '/bb533dodddddddddsaSdddddsdddd' to '/bb533dodddddddddsaSdddddsdddd' +0ms

  _detectDownloadChange(file) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.get(providerId, file.id)
          .flatMap(index => {
            log.trace('_detectDownloadChange for %s with index %s', file, index);
            if (!index) { // add
              return Bacon.fromPromise(this.drive.getPathByFileId(file.id))
                .flatMap(path => {
                  file.action = 'ADD';
                  file.path = path;
                  return file;
                });
            } else {
              return this._composeNodesWithIndex(providerId, file.id)
                .flatMap(nodes => {
                  let pathOrigin = this._nodesToPath(nodes);

                  if (file.action == 'REMOVE') { // remove
                    file.path = pathOrigin;
                    return file;

                  } else if (index.parentId != file.parentId) { // move
                    return Bacon.fromPromise(this.drive.getPathByFileId(file.id))
                      .flatMap(path => {
                        file.action = 'MOVE';
                        file.pathOrigin = pathOrigin;
                        file.path = path;
                        return file;
                      });

                  } else if (index.name != file.name) { // rename
                    file.action = 'MOVE';
                    file.pathOrigin = pathOrigin;
                    file.path = this._nodesToPath(nodes.slice(0, nodes.length - 1)) + '/' + file.name;
                    return file;

                  } else if (!this._isDir(file.mimeType)) { // change
                    file.action = 'CHANGE';
                    file.path = pathOrigin;
                    return file;
                  } else {
                    log.debug('Ignoring change %s', file.id, file.name);
                    // change is not relevant because
                    // - change was uploaded from this client
                    // - a parent directory is listed as changed if a child changes
                  }
                }).filter(set => set);
            }
          })
      });
  }

  _composeNodesWithIndex(providerId, fileId) {
    log.trace('composing path with index for %s', fileId);
    let walkToRoot = (fileId, parents = []) => {
      return this.cloudIndex.get(providerId, fileId)
        .flatMap(index => {
          if (index && index.name) {
            log.trace('Add %s to path', index.name);
            parents.push(index.name);
            return walkToRoot(index.parentId, parents);
          } else {
            log.trace('Path done. %s not belonging to path', index);
            parents.reverse();
            log.info(parents);
            return parents;
          }
        });
    }
    return walkToRoot(fileId);
  }

  _nodesToPath(nodes = []) {
    let path = '';
    nodes.forEach(d => {
      path += '/' + d;
    });
    if (path == '') {
      path = '/';
    }
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
