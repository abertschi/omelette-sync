var google = require('googleapis');
var path = require('path');
var Promise = require('bluebird');
import fs from 'fs';
import Bacon from 'baconjs';
let debug = require('debug')('bean:app');

var stream = require('stream');

const mixin = require('es6-class-mixin');
import StorageProvider from './storage-provider.js';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const ROOT_NAME_DRIVE = 'My Drive';
const BACON_SEQUENTIAL_WAIT = 10;

export default class GoogleDrive extends StorageProvider {

  constructor(options = {}) {
    super();
    this.auth = options.auth;
    this.basedir = this._addEnding(options.basedir, '/');

    google.options({
      auth: this.auth
    });

    this.drive = google.drive('v3');
  }

  getRootDir() {
    return this.basedir;
  }

  _getRootDirId() {

  }

  move(fromPath, toPath) {

  }

  remove(location) {
    location = this._qualifyDirectory(location);

    return Bacon.fromPromise(this.getFileMetaByPath(location))
      .flatMap(found => {
        return Bacon.fromPromise(this.removeById(found.id))
          .flatMap(() => {
            return {
              properties: []
            }
          });
      })
    .endOnError()
    .toPromise();
  }

  getStorage() {
    throw new Error('Not yet impl.');
  }

  upload(source, targetPath, properties = {}) {
    let fullPath = this._qualifyDirectory(targetPath);
    let dirname = path.dirname(targetPath);
    let basename = path.basename(targetPath);

    return Bacon.fromNodeCallback(fs, 'stat', source)
      .flatMap(stats => {
        return Bacon.fromPromise(this.createFolder(dirname))
          .flatMap(res => {
            let parentId = res.properties.id;
            if (stats.isFile()) {
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
            } else {
              return Bacon.fromPromise(this.createSingleFolder(basename, parentId));
            }
          })
          .map(response => {
            return {
              properties: {
                id: response ? response.id || null : null
              }
            }
          });
      })
      .endOnError()
      .toPromise();
  }

  createFolder(basedir) {
    basedir = this._qualifyDirectory(basedir);
    let childdirs = basedir.split('/').filter(a => a.trim() != '');

    return Bacon.fromPromise(this._createFoldersRecursively(null, childdirs))
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
      .flatMap(() => Bacon.try(source instanceof stream.Readable ? source : fs.createReadStream(source)))
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
        return Bacon.fromPromise(Promise.promisify(this.drive.files.create)(upload))
          .map(result => {
            return {
              id: result
            };
          });
      });
  }

  //   return Promise.promisify(fs.stat)(sourcePath)
  //     .then(stats => {
  //       return {
  //         dirname: path.dirname(targetPath),
  //         basename: path.basename(targetPath),
  //         isDir: !stats.isFile(),
  //         stats: stats
  //       };
  //     })
  //     .then(targetInfo => {
  //       return this.createFolder(targetInfo.dirname)
  //         .then(parentId => {
  //           targetInfo.parentId = parentId;
  //           return targetInfo;
  //         })
  //     })
  //     .then(targetInfo => {
  //       if (targetInfo.isDir) {
  //         return {
  //           id: targetInfo.parentId,
  //           path: targetPath
  //         }
  //       } else {
  //         return this.search(targetInfo.basename, {
  //             withParentId: targetInfo.parentId
  //           })
  //           .then(found => {
  //             if (found.files.length) {
  //               return this.removeById(found.files[0].id)
  //                 .then(() => targetInfo);
  //             } else {
  //               return targetInfo;
  //             }
  //           })
  //           .then(targetInfo => {
  //             let body = (source instanceof stream.Readable) ? source: fs.createReadStream(source);
  //
  //             let options = {
  //               resource: {
  //                 name: targetInfo.basename,
  //                 parents: [targetInfo.parentId]
  //               },
  //               media: {
  //                 body: body,
  //               },
  //               fields: 'id'
  //             };
  //
  //             debug('Uploading %s to %s', sourcePath, targetPath);
  //             return Promise.promisify(this.drive.files.create)(options)
  //               .then(response => {
  //                 if (response.id) {
  //                   response.path = targetPath;
  //                   response.parents = [targetInfo.parentId];
  //                 }
  //                 return response;
  //               });
  //           });
  //       }
  //     });
  // }

  removeById(id) {
    let options = {
      fileId: id,
      fields: 'id'
    };
    return Promise.promisify(this.drive.files.delete)(options)
      .then(removed => {
        return {
          id: id
        }
      });
  }

  getFileMetaByPath(directory) {
    directory = this._qualifyDirectory(directory);
    let parents = directory.split('/').filter(a => a.trim() != '');
    let basename = parents.pop();
    let parentDirectories = parents.reverse()
    let searchOptions = {
      onRoot: parents.length === 1
    };

    return Promise.resolve(this.search(basename, searchOptions)
        .then(found => {
          let foundFiles = found.files;
          if (foundFiles.length == 1) {
            // only 1 file found. No futher search necessary.
            return {
              id: foundFiles[0].id
            }
          } else if (foundFiles.length > 1) {
            return this._findMatchingParent(foundFiles, parentDirectories);
          } else {
            throw new Error(`No file found with path ${directory}`);
          }
        }))
      .then(found => {
        found.path = directory;
        found.name = basename;
        return found;
      });
  }

  getFileMeta(fileId) {
    let options = {
      fileId: fileId,
      fields: 'id, name, parents'
    }
    return Promise.promisify(this.drive.files.get)(options);
  }

  search(name, parms = {}) {
    let options = {
      q: `name='${name}'`,
      fields: 'nextPageToken, files(id, name, parents)'
    }

    if (parms.nextPageToken)
      options.pageToken = parms.nextPageToken;

    if (parms.onRoot)
      options.q = options.q + " and 'root' in parents";

    if (parms.withParentId)
      options.q = options.q + `and '${parms.withParentId}' in parents`;

    let trashed = options.includeTrashed ? true : false;
    options.q = options.q + ` and trashed = ${trashed}`;

    return this._executeRequest(() => {
      return Promise.promisify(this.drive.files.list)(options);
    });

    //debug('Searching for %s', name);

  }

  changes() {}



  createSingleFolder(folderName, parentId = null) {
    let searchArgs = {};

    if (parentId)
      searchArgs.withParentId = parentId;
    else
      searchArgs.onRoot = true;

    return this.search(folderName, searchArgs)
      .then(found => {
        let existing;
        if (found.files.length) {
          existing = {
            id: found.files[0].id,
            name: folderName
          }
        }
        return existing;
      })
      .then(existing => {
        if (existing)
          return existing;

        let options = {
          resource: {
            name: folderName,
            mimeType: FOLDER_MIME_TYPE
          },
          fields: 'id, name'
        }

        if (parentId)
          options.resource.parents = [parentId];

        debug('Creating folder %s', folderName);
        let exec = () => Promise.promisify(this.drive.files.create)(options);
        return this._executeRequest(exec);
        //return Promise.promisify(this.drive.files.create)(options);
      });
  }

  _createFoldersRecursively(parentId, directories, directoryIndex = 0) {
    return Promise.resolve(this.createSingleFolder(directories[directoryIndex], parentId))
      .then(successful => {
        directoryIndex++;
        if (directoryIndex < directories.length) {
          return this._createFoldersRecursively(successful.id, directories, directoryIndex);
        } else {
          debug('All folders [%s] created. child id: %s', directories, successful.id);
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
        debug(array);
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
            debug('parent %s (%s) matches directory tree %s', file.id, file.name, directories);
            return true;
          }
        } else {
          if (!file.parents && (index == directories.length || !directories.length)) {
            debug('parent %s (%s) matches directory tree %s', file.id, file.name, directories);
            return true;
          } else {
            debug('parent %s (%s) does not match directory tree %s', file.id, file.name, directories);
            return false;
          }
        }
      });
  }

  _executeRequest(callback) {
    debug('exec', callback)
    return Bacon.retry({
      source: callback,
      retries: 5,
      isRetryable: function(error) {
        debug('bean', error);
        return true;
      },
      delay: function(context) {
        return 1000;
      }
    }).toPromise();
  }

  _splitIntoDirs(path) {
    return path.split('/').filter(a => a.trim() != '');
  }

  _qualifyDirectory(directory) {
    if (directory.startsWith('/')) {
      return this.basedir.concat(directory.substr(1));
    } else {
      return this.basedir.concat(directory);
    }
  }

  _addEnding(directory, ending) {
    return directory.endsWith(ending) ? directory : directory + ending;
  }
}
