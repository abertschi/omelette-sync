import fs from 'fs';
import Bacon from 'baconjs';
import isNetworkError from './is-network-error.js';
import colors from 'colors';
import StorageProvider from './storage-provider.js';

var agent = require('superagent-promise')(require('superagent'));
var stream = require('stream');
const mixin = require('es6-class-mixin');
let debug = require('debug')('bean:app:1');
var google = require('googleapis');
var path = require('path');
var Promise = require('bluebird');

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const BACON_SEQUENTIAL_WAIT = 10;

const BASE_URL = 'https://www.googleapis.com/drive/v3';

export default class GoogleDrive extends StorageProvider {

  constructor(options = {}) {
    super();
    this.auth = options.auth;
    this.retry = options.retry || 10;
    this.basedir = this._addEnding(options.basedir, '/');
    this.rootDirId = null;
    this.absoluteRootDirId = null;

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
              properties: []
            }
          });
      })
      .doAction(() => debug(`Delete of ${location} done.`))
      .endOnError()
      .toPromise();
  }

  getStorage() {
    throw new Error('Not yet impl.');
  }

  getRootDir() {
    return this.basedir;
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
                sourceId: meta.source.id,
                targetId: meta.target,
              }
            };
          })
      })
      .endOnError()
      .toPromise();
  }

  _isStream(readable) {
    return readable instanceof stream.Readable;
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
          .flatMap(() => this._uploadWithParentId(source, basename, parentId)); // TODO: double id
      })
      .map(response => {
        return {
          properties: {
            id: response ? response.id || null : null
          }
        }
      })
    .doAction(() => debug(`Upload of ${targetPath} done.`))
    .endOnError()
    .toPromise();
  }

  createFolder(basedir) {
    basedir = this._qualifyDirectory(basedir);
    let childdirs = basedir.split('/').filter(a => a.trim() != '');

    return Bacon.fromPromise(this._getAbsoluteRootDirId())
      .flatMap(id => {
        return Bacon.fromPromise(this._createFoldersRecursively(id, childdirs))
      })
      .flatMap(result => {
        return {
          properties: {
            id: result.id
          }
        };
      })
      .doAction(() => debug('Folder %s created', basedir))
      .endOnError()
      .toPromise();
  }

  _uploadWithParentId(source, name, parentId) {
    return Bacon.once()
      .flatMap(() => {
        if (source instanceof stream.Readable) {
          return source;
        } else {
          try {
            let stream = fs.createReadStream(source);
            stream.on('error', (e) => {
              debug('Error in stream', e, e.stack);
              return new Bacon.Error(e);
              // TODO: Error handling streams
            });
            return stream;
          } catch (e) {
            return new Bacon.Error(e);
          }
        }
      })
      .map(body => {
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
        return this._request(this.drive.files, 'create', upload)
          .flatMap(result => {
            return {
              id: result
            };
          });
      });
  }

  _getRootDirId() {
    if (!this.rootDirId) {
      return this.createFolder('/')
        .then(found => {
          this.rootDirId = found.id;
          return found.id;
        });
    } else {
      return Bacon.once(this.rootDirId).toPromise();
    }
  }

  removeById(id) {
    let options = {
      fileId: id,
      fields: 'id'
    };

    return this._request(this.drive.files, 'delete', options).toPromise();
  }

  _getAbsoluteRootDirId() {
    if (!this.absoluteRootDirId) {
      let options = {
        fileId: 'root',
        fields: 'id'
      }
      return this._request(this.drive.files, 'get', options)
        .flatMap(found => found.id)
        .doAction(id => this.absoluteRootDirId = id)
        .toPromise();
    } else {
      return Bacon.once(this.absoluteRootDirId).toPromise();
    }
  }

  getFileMetaByPath(directory) {
    directory = this._qualifyDirectory(directory);
    let tree = directory.split('/').filter(a => a.trim() != '');

    return Bacon.once()
      .flatMap(() => {
        debug(tree);
        if (!tree || !tree.length || tree.length == 1) {
          return Bacon.fromPromise(this._getAbsoluteRootDirId())
            .flatMap(found => {
              return {
                id: found
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
      .toPromise();
  }

  getFileMeta(fileId) {
    let options = {
      fileId: fileId,
      fields: 'id, name, parents'
    }
    return this._request(this.drive.files, 'get', options).toPromise();
  }

  search(name, parms = {}) {
    let options = {
      q: `name='${name}'`,
      fields: 'nextPageToken, files(id, name, parents)'
    }

    let trashed = options.includeTrashed ? true : false;
    options.q += ` and trashed = ${trashed}`;

    if (parms.nextPageToken)
      options.pageToken = parms.nextPageToken;

    if (parms.withParentId)
      options.q += ` and '${parms.withParentId}' in parents`;

    return this._request(this.drive.files, 'list', options).toPromise();
  }

  changes() {}

  createSingleFolder(folderName, parentId = null) {
    let searchArgs = {};

    return Bacon.once().flatMap(() => {
        if (parentId) {
          searchArgs.withParentId = parentId;
          return searchArgs;
        } else {
          return Bacon.fromPromise(this._getRootDirId())
            .flatMap(id => {
              searchArgs.withParentId = id;
              return searchArgs;
            });
        }
      })
      .flatMap(searchArgs => {
        return Bacon.fromPromise(this.search(folderName, searchArgs))
          .flatMap(search => {
            debug('search result for ', folderName, search);
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

  _createFoldersRecursively(parentId, directories, directoryIndex = 0) {
    return Promise.resolve(this.createSingleFolder(directories[directoryIndex], parentId))
      .then(successful => {
        directoryIndex++;
        if (directoryIndex < directories.length) {
          return this._createFoldersRecursively(successful.id, directories, directoryIndex);
        } else {
          //debug('All folders [%s] created. child id: %s', directories, successful.id);
          return successful;
        }
      });
  }

  _findMatchingParent(files, parentDirectories) {
    return Bacon
      .sequentially(BACON_SEQUENTIAL_WAIT, files)
      .filter(file => file.parents && file.parents.length)
      .flatMapLatest(file => {
        // no scenario is familiar where a file has more than 1 parents
        // always stick to first parent
        let parentId = file.parents[0];
        return Bacon
          .fromPromise(this._followParents(parentId, parentDirectories))
          .filter(found => found)
          .flatMap(() => Bacon.fromArray([new Bacon.Next(file), new Bacon.End()]));
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
          return Bacon.once({
            id: file.id,
          });
        }
      })
      .firstToPromise();
  }

  _followParents(parentId, directories = [], index = 0) {
    return this.getFileMeta(parentId)
      .then(file => {
        if (file.name == directories[index]) {
          if (file.parents.length && index < directories.length) {
            index++
            return this._followParents(file.parents[0], directories, index);
          } else {
            //debug('parent %s (%s) matches directory tree %s', file.id, file.name, directories);
            return true;
          }
        } else {
          if (!file.parents && (index == directories.length || !directories.length)) {
            //debug('parent %s (%s) matches directory tree %s', file.id, file.name, directories);
            return true;
          } else {
            //debug('parent %s (%s) does not match directory tree %s', file.id, file.name, directories);
            return false;
          }
        }
      });
  }

  _splitIntoDirs(path) {
    return path.split('/').filter(a => a.trim() != '');
  }

  _qualifyDirectory(directory) {
    if (directory.startsWith('/') && directory.length > 1) {
      return this.basedir.concat(directory.substr(1));
    } else if (directory.length == 1) {
      return this.basedir;
    } else {
      return this.basedir.concat(directory);
    }
  }

  _addEnding(directory, ending) {
    return directory.endsWith(ending) ? directory : directory + ending;
  }

  _request(object, name, options) {
    let source = Bacon.fromPromise(new Promise((resolve, reject) => {
      try {
        let result = object[name](options, (err, response) => {
          if (err) {
            reject(err, result);
          } else {
            resolve(response, result);
          }
        }).on('error', (err) => {
          reject(err, result);
        });

      } catch (e) {
        reject(e, result);
      }
    }));

    return Bacon.retry({
      source: function() {
        return source;
      },
      retries: this.retry,
      isRetryable: function(error) {
        let retryable = isNetworkError(error);
        if (retryable) {
          debug(`Network or HTTP error (${error.code}) occurred while (google-drive:${name}).`.red);
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
