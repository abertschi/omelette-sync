import fs from 'fs';
import Bacon from 'baconjs';
import isNetworkError from './is-network-error.js';
import colors from 'colors';
import StorageApi from './storage-api.js';

var agent = require('superagent-promise')(require('superagent'));
var stream = require('stream');
const mixin = require('es6-class-mixin');
let debug = require('debug')('bean:app:1');
var google = require('googleapis');
var path = require('path');
var Promise = require('bluebird');

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const BACON_SEQUENTIAL_WAIT = 10;


let sample = {
  name: 'folder',
  type: FOLDER_MIME_TYPE,
  children: [sample]
}

export default class GoogleDriveApi extends StorageApi {

  constructor(options = {}) {
    super();
    this.auth = options.auth;
    this.retry = options.retry || 10;
    this.mountDir = this._addSuffixAndPrefix(options.mountDir, '/', '/');

    this._syncRoot = null;
    this._rootDir = null;
    this._userId = null;

    google.options({
      auth: this.auth
    });

    this.drive = google.drive('v3');
  }

  remove(location) {
    return Bacon.fromPromise(this.getFileMetaByPath(location))
      .flatMap(found => {
        return Bacon.fromPromise(this.removeById(found.id))
          .flatMap(() => {
            return {
              properties: {
                id: found.id,
                name: found.name
              }
            }
          });
      })
      .doAction(() => debug(`Delete of ${location} done.`))
      .endOnError()
      .toPromise();
  }

  getStorage() {
    let options = {
      fields: 'storageQuota'
    }
      return this._request(this.drive.about, 'get', options)
        .flatMap(response => {
          return {
            total: response.storageQuota.limit,
            used: response.storageQuota.usage,
          }
        })
        .toPromise();
  }

  getUserId() {
    let options = {
      fields: 'user'
    }
    if (!this._userId) {
      return this._request(this.drive.about, 'get', options)
        .flatMap(response => response.user.permissionId)
        .doAction(id => this._userId = id)
        .toPromise();
    } else {
      return Bacon.once(this._userId).toPromise();
    }
  }

  getMountDir() {
    return this.mountDir;
  }

  download(location, writeStream, properties = {
    id: null
  }) {
    let fileId = properties.id || null;

    return Bacon.once()
      .flatMap(() => {
        if (properties.id) {
          return properties.id;
        } else {
          return Bacon.fromPromise(this.getFileMetaByPath(location))
            .flatMap(meta => meta.id);
        }
      })
      .flatMap(fileId => {
        let options = {
          fileId: fileId,
          alt: 'media'
        };

        return Bacon.fromBinder(sink => {
          this.drive.files.get(options)
            .on('end', () => {
              sink([new Bacon.Next(), new Bacon.End()]);
            })
            .on('error', (err) => {
              sink(new Bacon.Error(err));
            }).pipe(writeStream);
        })
      })
      .endOnError()
      .toPromise();
  }

  listChanges(key, properties = {
    startPageToken: null
  }) {
    let pageToken = key || properties.startPageToken || null;
    return Bacon.once()
      .flatMap(() => {
        if (!pageToken) {
          return this._getStartPageToken();
        } else {
          return pageToken;
        }
      })
      .flatMap(token => {
        let options = {
          pageToken: token,
          includeRemoved: true,
          fields: 'changes, newStartPageToken, nextPageToken'
        }
        return this._request(this.drive.changes, 'list', options);
      })
      .flatMap(response => {
        if (response.nextPageToken) {
          return Bacon.fromPromise(this.listChanges(response.nextPageToken));
        } else {
          return [new Bacon.Next(response), new Bacon.End()];
        }
      })
      .flatMap(response => {
        return Bacon.fromArray(response.changes)
          .filter(c => c.file)
          .flatMap(change => {
            let action;
            let parentId;
            if (change.removed || change.file.trashed || change.file.explicitlyTrashed) {
              action = 'REMOVE';
            } else {
              action = 'UNKNOWN'
              let parents = change.file.parents;
              if (parents && parents.length) {
                parentId = parents[0];
              }
            }
            return {
              action: action,
              properties: {
                id: change.fileId,
                parentId: parentId
              }
            }
          }).fold([], array, element => {
            array.push(element);
            return array;
          }).flatMap(array => {
            return {
              startPageToken: response.newStartPageToken,
              changes: array
            };
          });
      }).toPromise();
  }

  _getStartPageToken() {
    return this._request(this.drive.changes, 'startPageToken')
      .flatMap(respone => response.startPageToken);
  }

  move(fromPath, toPath) {
    let fromMetaStream = Bacon.fromPromise(this.getFileMetaByPath(fromPath));
    let basedir = path.dirname(toPath);
    let filename = path.basename(toPath);
    let toMetaStream = Bacon.fromPromise(this.createFolder(basedir));

    return Bacon.zipWith(fromMetaStream, toMetaStream, (fromMeta, toMeta) => {
        debug(fromMeta, toMeta);
        return {
          source: fromMeta,
          target: toMeta
        };
      })
      .flatMap(meta => {
        return Bacon.fromPromise(this.getFileMeta(meta.source.id))
          .flatMap(sourceDetails => {
            let options = {
              fileId: meta.source.id,
              removeParents: sourceDetails.parents,
              addParents: [meta.target.properties.id],
              resource: {
                name: filename,
              }
            }
            return this._request(this.drive.files, 'update', options)
          })
          .flatMap(result => {
            return {
              properties: {
                idOrigin: meta.source.id,
                id: meta.target,
              }
            };
          })
      })
      .endOnError()
      .toPromise();
  }

  upload(source, targetPath, properties = {}) {
    let dirname = path.dirname(targetPath);
    let basename = path.basename(targetPath);

    return Bacon.fromPromise(this.createFolder(dirname))
      .flatMap(res => {
        let parentId = res.properties.id;
        return Bacon.fromPromise(this.search(basename))
          .flatMap(search => {
            if (search && search.files && search.files.length) {
              return Bacon.fromArray(search.files)
                .flatMap(file => Bacon.fromPromise(this.removeById(file.id)));
            } else {
              return Bacon.once();
            }
          })
          .flatMap(() => this.uploadWithParentId(source, basename, parentId))
          .flatMap(response => {
            let tree = res.properties.tree;
            let child = this._getMostInnerChild(tree);
            child.name = basename;
            child.id = response.id;

            return {
              properties: {
                id: response.id,
                tree: tree
              }
            };
          });
      })
      .doAction(() => debug(`Upload of ${targetPath} done.`))
      .endOnError()
      .toPromise();
  }


  createFolder(basedir) {
    basedir = this._qualifyDirectory(basedir);
    let childdirs = this._splitIntoDirs(basedir);
    let directoryTree = {};

    return Bacon.fromPromise(this._getRootDir())
      .flatMap(rootDir => {
        directoryTree = rootDir;
        return Bacon.fromPromise(this._createFolders(directoryTree, childdirs));
      })
      .flatMap((innerFolder) => {
        // Remove all folders from tree that are outside syncdir.
        return Bacon.fromArray(this._splitIntoDirs(this.mountDir))
          .fold(0, (sum, dir) => {
            return sum + 1;
          })
          .flatMap(numberOfDirsOutside => {
            return {
              properties: {
                id: innerFolder.id,
                name: innerFolder.name,
                tree: this._removeFoldersFromTree(directoryTree, numberOfDirsOutside)
              }
            };
          });
      })
      .doAction(() => debug('Folder %s created', basedir))
      .endOnError()
      .toPromise();
  }

  createSingleFolder(folderName, parentId = null) {
    let searchArgs = {};

    return Bacon.once().flatMap(() => {
        if (parentId) {
          searchArgs.withParentId = parentId;
          return searchArgs;
        } else {
          return Bacon.fromPromise(this._getSyncRoot())
            .flatMap(syncRoot => {
              searchArgs.withParentId = syncRoot.id;
              return searchArgs;
            });
        }
      })
      .flatMap(searchArgs => {
        return Bacon.fromPromise(this.search(folderName, searchArgs))
          .flatMap(search => {
            if (search.files.length) {
              return {
                id: search.files[0].id,
                name: folderName
              };
            } else {
              let options = {
                resource: {
                  name: folderName,
                  mimeType: FOLDER_MIME_TYPE,
                  parents: [searchArgs.withParentId]
                },
                fields: 'id, name'
              }
              return this._request(this.drive.files, 'create', options);
            }
          });
      })
      .toPromise();
  }

  uploadWithParentId(source, name, parentId) {
    return Bacon.once()
      .flatMap(() => {
        if (this._isStream(source)) {
          return source;
        } else {
          try {
            let stream = fs.createReadStream(source);
            stream.on('error', (e) => {
              debug('Error in stream', e, e.stack);
              return new Bacon.Error(e);
            });
            return stream;
          } catch (e) {
            return new Bacon.Error(e);
          }
        }
      })
      .flatMap(body => {
        return {
          resource: {
            name: name,
            parents: [parentId]
          },
          media: {
            body: body,
          },
          fields: 'id'
        };
      })
      .flatMap(upload => {
        return Bacon.fromBinder(sink => {
          // if an upload fails, do not retry to upload because input stream must be reset first
          this.drive.files.create(upload, (err, response => {
              if (err) {
                sink(new Bacon.Error(err));
              } else {
                sink([new Bacon.Next(response), new Bacon.End()]);
              }
            }))
            .on('error', (err) => {
              sink(new Bacon.Error(err));
            });
        })
      })
      .flatMap(result => {
        return {
          id: result.id,
          name: name
        };
      });
  }

  removeById(id) {
    let options = {
      fileId: id,
      fields: 'id'
    };
    return this._request(this.drive.files, 'delete', options).toPromise();
  }

  getPathByFileId(fileId) {
    let followUp = (fileId, folders = []) => {
      return Bacon.fromPromise(this.getFileMeta(fileId))
        .flatMapConcat(meta => {
          return Bacon.fromPromise(this._getSyncRoot())
            .flatMap(syncRoot => {
              if (syncRoot.id == meta.id || (!meta.parents || !meta.parents.length)) {
                return folders;
              } else {
                folders.push(meta.name);
                return followUp(meta.parents[0], folders);
              }
            });
        });
    };
    return followUp(fileId)
      .flatMap(folders => Bacon.fromArray(folders.reverse()))
      .fold('', (path, folder) => {
        path += '/' + folder;
        return path;
      })
      .flatMap(path => {
        if (path == '') {
          return '/';
        }
      })
      .toPromise();
  }

  getFileMetaByPath(directory) {
    directory = this._qualifyDirectory(directory);
    let tree = directory.split('/').filter(a => a.trim() != '');

    return Bacon.once()
      .flatMap(() => {
        debug(tree);
        if (!tree || !tree.length || tree.length == 1) {
          return Bacon.fromPromise(this._getRootDir())
            .flatMap(rootDir => {
              return {
                id: rootDir.id,
                name: rootDir.name
              };
            });
        } else {
          return;
        }
      })
      .flatMap(absoluteRoot => {
        if (absoluteRoot && (!tree || !tree.length)) {
          return absoluteRoot;
        } else {
          let basename = tree.pop();
          let treeUpwards = tree.reverse()
          let searchOptions = {};

          if (absoluteRoot && tree && tree.length == 1) {
            searchOptions.withParentId = absoluteRoot.id;
          }

          return Bacon.fromPromise(this.search(basename, searchOptions))
            .flatMap(search => {
              if (search.files.length == 1) {
                return {
                  id: search.files[0].id
                };
              } else if (search.files.length > 1) {
                return Bacon.fromPromise(this._findMatchingParent(search.files, treeUpwards));
              } else {
                return new Bacon.Error(`No file found with path ${directory}`);
              }
            });
        }
      })
      .doAction(f => debug(JSON.stringify(f)))
      .toPromise();
  }

  getFileMeta(fileId) {
    let options = {
      fileId: fileId,
      fields: 'id, name, parents'
    }
    return this._request(this.drive.files, 'get', options).toPromise();
  }

  search(name, parms = {
    includeTrashed: false,
    nextPageToken: null,
    withParentId: null
  }) {
    let options = {
      q: `name='${name}'`,
      fields: 'nextPageToken, files(id, name, parents)'
    }

    let trashed = parms.includeTrashed ? true : false;
    options.q += ` and trashed = ${trashed}`;

    if (parms.nextPageToken)
      options.pageToken = parms.nextPageToken;

    if (parms.withParentId)
      options.q += ` and '${parms.withParentId}' in parents`;

    return this._request(this.drive.files, 'list', options).toPromise();
  }

  _findMatchingParent(files, parentDirectories) {
    return Bacon
      .sequentially(BACON_SEQUENTIAL_WAIT, files)
      .filter(file => file.parents && file.parents.length)
      .flatMapLatest(file => {
        // no scenario is familiar where a file has more than 1 parents
        // always stick to first parent
        let parentId = file.parents[0];
        let tree = {
          id: file.id,
          name: file.name
        }
        return Bacon
          .fromPromise(this._followParents(parentId, parentDirectories, 0, tree))
          .filter(found => found)
          .flatMap(() => Bacon.fromArray([new Bacon.Next(tree), new Bacon.End()]));
      })
      .fold([], (array, file) => {
        array.push(file);
        return array;
      })
      .flatMap(array => {
        if (!array.length) {
          return Bacon.once(new Bacon.Error(`No file found with parents [${parentDirectories}]`));
        } else {
          let file = array[0];
          return Bacon.once(file);
        }
      })
      .firstToPromise();
  }

  _isStream(readable) {
    return readable instanceof stream.Readable;
  }

  _getMostInnerChild(tree) {
    if (tree.child) {
      return this._getMostInnerChild(tree.child);
    } else {
      return tree;
    }
  }

  _followParents(parentId, directories = [], index = 0, tree = {}) {
    return this.getFileMeta(parentId)
      .then(file => {
        tree.parent = {
          id: file.id,
          name: file.name
        };
        if (file.name == directories[index]) {
          if (file.parents.length && index < directories.length) {
            index++
            return this._followParents(file.parents[0], directories, index, tree.parent);
          } else {
            return true;
          }
        } else {
          if (!file.parents && (index == directories.length || !directories.length)) {
            return true;
          } else {
            return false;
          }
        }
      });
  }

  _removeFoldersFromTree(tree, number = 0) {
    let current = 0;
    let remove = (tree, number) => {
      if (current < number && tree.child) {
        current++;
        return remove(tree.child);
      } else {
        return tree;
      }
    };
    return remove(tree, number);
  }

  _createFolders(directoryTree, dirsToCreate, index = 0) {
    return Promise.resolve(this.createSingleFolder(dirsToCreate[index], directoryTree.id))
      .then(folder => {
        directoryTree.child = folder;
        index++;
        if (index < dirsToCreate.length) {
          return this._createFolders(directoryTree.child, dirsToCreate, index);
        } else {
          return folder;
        }
      });
  };

  _getRootDir() {
    if (!this._rootDir) {
      let options = {
        fileId: 'root',
        fields: 'id, name'
      }
      return this._request(this.drive.files, 'get', options)
        .doAction(rootDir => {
          this._rootDir = {
            id: rootDir.id,
            name: rootDir.name
          };
        })
        .toPromise();
    } else {
      return Bacon.once(this._rootDir).toPromise();
    }
  }

  _getSyncRoot() {
    if (!this._syncRoot) {
      return this.createFolder('/')
        .then(found => {
          this._syncRoot = {
            id: found.properties.id,
            name: found.properties.name
          };
          return this._syncRoot;
        });
    } else {
      return Bacon.once(this._syncRoot).toPromise();
    }
  }

  _splitIntoDirs(path) {
    return path.split('/').filter(a => a && a.trim() != '');
  }

  _qualifyDirectory(directory) {
    if (directory.startsWith('/') && directory.length > 1) {
      return this.mountDir.concat(directory.substr(1));
    } else if (directory.length == 1) {
      return this.mountDir;
    } else {
      return this.mountDir.concat(directory);
    }
  }

  _addPrefix(directory, ending) {
    return directory.endsWith(ending) ? directory : directory + ending;
  }

  _addSuffix(directory, suffix) {
    return directory.startsWith(suffix) ? directory : suffix + directory;
  }

  _addSuffixAndPrefix(directory, suffix, prefix) {
    return this._addPrefix(this._addSuffix(directory, suffix), prefix);
  }

  _request(object, name, options) {
    let source = Bacon.fromPromise(new Promise((resolve, reject) => {
      try {
        let request = object[name](options, (err, response) => {
          if (err) {
            reject(err, request);
          } else {
            resolve(response, request);
          }
        }).on('error', (err) => {
          reject(err, request);
        });
      } catch (e) {
        reject(e, request);
      }
    }));

    return this._retryOnError(source);
  }

  _retryOnError(eventStream, beforeRetry) {
    return Bacon.retry({
      source: function() {
        return eventStream;
      },
      retries: this.retry,
      isRetryable: function(error) {
        let retryable = isNetworkError(error);
        if (retryable) {
          if (beforeRetry) {
            beforeRetry(error);
          }
          debug(`Network or HTTP error (${error.code}) occurred while (google-drive).`.red);
          debug(`${error.stack}`.red);
        }
        return retryable;
      },
      delay: function(context) {
        return Math.pow(2, context.retriesDone) * 1000 + Math.floor((Math.random() * 60) + 1) * 1000;
      }
    })
  }
}
