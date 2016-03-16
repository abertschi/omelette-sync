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
    log.trace('Post Upload with: %s', response);

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
  }

  postRemove(file, response) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.remove(providerId, response.properties.id);
      });
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
            return Bacon.fromPromise(this.drive.listChanges(lastPageToken))
              .flatMap(pull => {
                pageToken = pull.startPageToken;
                /*
                 * changes.reverse()
                 * do newest change last, important to handle new directories correctly
                 */
                return Bacon.fromArray(pull.changes.reverse())
                  .flatMap(change => {
                    return this._detectChangeAction(change)
                      .flatMap(file => {
                        file.isDir = this._isDir(change.mimeType),

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

  _detectChangeAction(file) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.get(providerId, file.id)
          .flatMap(index => {
            log.trace('Detecting action of pulled change. Comparing with index.' +
              'CHANGE: %s \nINDEX: %s', file, index);

            if (!index) {
              /*
               * This change is not yet indexed. It is an ADD change.
               */
              return this._getFileNodes(providerId, file.parentId)
                .flatMap(parentNodes => {
                  file.action = 'ADD';
                  parentNodes.push(file.name);
                  file.path = this._nodesToPath(parentNodes);
                  return file;
                });
            } else {
              return this._getFileNodes(providerId, file.id)
                .flatMap(nodes => {
                  let pathOrigin = this._nodesToPath(nodes);
                  if (file.action == 'REMOVE') { // remove
                    /*
                     * This change is a REMOVE change.
                     */
                    file.path = pathOrigin;
                    log.info('Remove with composed path: %s', pathOrigin);
                    return file;

                  } else if (index.parentId != file.parentId) {
                    /*
                     * MOVE change. The file/ directory got a new parent.
                     */
                    return this._getFileNodes(providerId, file.parentId)
                      .flatMap(parentNodes => {
                        file.action = 'MOVE';
                        file.pathOrigin = pathOrigin;
                        parentNodes.push(file.name);
                        file.path = this._nodesToPath(parentNodes);
                        return file;
                      });

                  } else if (index.name != file.name) {
                    /*
                     * MOVE change. The file/ directory was renamed
                     */
                    file.action = 'MOVE';
                    file.pathOrigin = pathOrigin;
                    file.path = this._nodesToPath(nodes.slice(0, nodes.length - 1)) + '/' + file.name;
                    return file;

                  } else if (!this._isDir(file.mimeType)) {
                    /*
                     * CHANGE change. New content.a
                     */
                    file.action = 'CHANGE';
                    file.path = pathOrigin;
                    return file;

                  } else {
                    log.debug('Ignoring change %s', file.id, file.name);
                    /*
                     * This change is not relevant because:
                     * - it was uploaded by this client or
                     * - the parent directory of this change is listed as a changes which is not relevant.
                     */
                  }
                }).filter(set => set);
            }
          })
      });
  }

  _getFileNodes(providerId, fileId) {
    let walkToRoot = (fileId, parents = []) => {
      return this.cloudIndex.get(providerId, fileId)
        .flatMap(index => {
          if (index && index.name) {
            log.trace('Add %s to path', index.name);
            parents.push(index.name);
            return walkToRoot(index.parentId, parents);
          } else {

            parents.pop();
            parents.reverse();
            log.trace('Composed index: %s', parents);
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

  _removeFromIndex(change) {
    return Bacon.fromPromise(this.drive.getUserId())
      .flatMap(providerId => {
        return this.cloudIndex.remove(providerId, change.id);
      });
  }

  _addToIndex(change) {
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
