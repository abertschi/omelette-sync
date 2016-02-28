var google = require('googleapis');
var path = require('path');
var Promise = require('bluebird');
import fs from 'fs';
import Bacon from 'baconjs';
let debug = require('debug')('bean:app');

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const ROOT_NAME_DRIVE = 'My Drive';
const BACON_SEQUENTIAL_WAIT = 150;

export default class GoogleDrive {

  constructor(options = {}) {
      this.watchHomeDir = options.watchHomeDir;
      if (!this.watchHomeDir.endsWith('/')) {
        this.watchHomeDir += '/';
      }
      this.auth = options.auth;
      this.rootDir = options.rootDir || '/';
      this.generatedIds = [];

      google.options({
        auth: this.auth
      });

      this.drive = google.drive('v3');

    }
    //
    // getGeneratedId() {
    //   return Bacon.once(this.generatedIds)
    //     .flatMap(ids => {
    //       if (!ids.length) {
    //
    //         const ARGS = {
    //           maxResults: 20
    //         }
    //
    //         return Bacon
    //           .fromNodeCallback(this.drive.files.generateIds, ARGS)
    //           .map(response => {
    //             return ids.concat(response.ids);
    //           });
    //       }
    //     })
    //     .map(ids => {
    //       let id = ids.pop;
    //       this.generatedIds = ids;
    //       return id;
    //     });
    // }

  doAdd(upload) {
    let options = {
      resource: {
        name: path.basename(upload.path)
      },
      media: {
        body: fs.createReadStream(upload.path) // todo encryption
      },
      fields: 'id'
    };

    return Promise
      .promisify(this.drive.files.create)(options)
      .then(response => {
        return response;
      })
      .catch(function(err) {
        console.log('err', err);
      });
  }



  getFileIdByPath(directory) {
    let parents = directory.replace(this.watchHomeDir, '').split('/');
    let basename = parents.pop();
    let directories = parents.reverse().filter(a => a.trim() != '');

    return Promise
      .resolve(this.searchFiles(basename)
        .then(result => {
          let files = result.files;
          if (files.length == 1) {
            return files[0].id;
          } else if (files.length > 1) {
            return Bacon
              .sequentially(BACON_SEQUENTIAL_WAIT, files)
              .filter(f => f.parents.length)
              .flatMapLatest(f => {
                // no scenario is familiar where a file has more than 1 parents
                // always stick to first parent
                return Bacon
                  .fromPromise(this._isParent(f.parents[0], directories, 0))
                  .filter(found => found)
                  .flatMap([new Bacon.Next(f), new Bacon.End()]);
              })
              .fold([], (array, file) => {
                array.push(file);
                return array;
              })
              .flatMap(array => {
                debug('array size', array.length);
                if (!array.length) {
                  return Bacon.once(new Bacon.Error(`No file found with path ${directory}`));
                } else {
                  return Bacon.once(array[0]);
                }
              })
              .firstToPromise();
          } else {
            throw new Error(`No file found with path ${directory}`);
          }
        }));
  }

  getFileInfo(fileId, trashed = false) {
    let options = {
      fileId: fileId,
      fields: 'id, name, parents'
    }
    return Promise
      .promisify(this.drive.files.get)(options);
  }

  searchFiles(name, parms = {}) {
    let options = {
      q: `name='${name}'`,
      fields: 'nextPageToken, files(id, name, parents)'
    }

    if (parms.trashed !== false)
      options.q += ' and trashed = true';
    if (parms.nextPageToken)
      options.pageToken = parms.nextPageToken;
    if (parms.onRoot)
      options.q += " and 'root' in parents";

    return Promise
      .promisify(this.drive.files.list)(options);
  }

  createFolder(name) {
    let options = {
      resource: {
        name: name,
        mimeType: FOLDER_MIME_TYPE
      }
    }

    return Promise
      .promisify(this.drive.files.create)(options);
  }

  //
  // resource: {
  //   title: path.basename(upload.path);
  // },
  // media: {
  //   body: fs.createReadStream(upload.path) // todo encryption
  // }

  upload(upload) {

    switch (upload.action) {
      case 'ADD':
        //return this.doAdd(upload);
        break;
      case 'CHANGE':
        break;
      case 'REMOVE':
        break;
      case 'MOVE':
        break;
      default:
    }
  }

  changes() {}

  createFolders(basedir) {
    let childdirs = basedir
      .split('/')
      .filter(a => a.trim() != '');
    let rootdir = childdirs.shift();
    debug('rootdir: %s and childs: %s', rootdir, childdirs);


    return Bacon.once(rootdir)
      .flatMap(dir => {
        let search = {
          onRoot: true
        }

  //       Bacon.fromArray([1,2,3])
  // .withStateMachine(0, function(sum, event) {
  //   if (event.hasValue())
  //     return [sum + event.value(), []]
  //   else if (event.isEnd())
  //     return [undefined, [new Bacon.Next(sum), event]]
  //   else
  //     return [sum, [event]]
  // })

        return Bacon.fromPromise(this.searchFiles(dir, search))
          .flatMapLatest(rootdirInfo => {
            if (!rootdirInfo.files.length) {
              childdirs.unshift(dir);
            }
            let init = {
              id: rootdirInfo.id || false,
              name: rootdirInfo.name || false
            };

            return Bacon.sequentially(BACON_SEQUENTIAL_WAIT, childdirs)
              .fold([init], (array, directory) => {
                let last = array[array.length - 1];
                debug('last', last, array[array.length - 1]);
                return Bacon.fromPromise(this.createFolder(directory, last.id))
                  .map(created => {
                    debug(created);
                    array.push({
                      id: created.id,
                      name: directory
                    });
                    return array;
                  });
              });
          });
      }).toPromise();
  }

  _createFolder(folderName, parentId, directories, directoryIndex) {
    return Bacon.fromPromise(this.createFolder(folderName, parentId))
      .flatMap(successful => {
        if (directories.length < directoryIndex) {
          directoryIndex++;
          return this._createFolder(directories[directoryIndex], successful.id, directories, directoryIndex);
        }
      });
  }

  createFolder(folderName, parentId = null) {
    let options = {
      resource: {
        name: folderName,
        mimeType: FOLDER_MIME_TYPE
      },
      fields: 'id, name'
    }

    if (parentId)
      options.resource.parents = [parentId];

    return Promise
      .promisify(this.drive.files.create)(options);
  }

  _isParent(parentId, directories, index) {
    return this.getFileInfo(parentId)
      .then(file => {
        if (file.name == directories[index]) {
          if (file.parents.length && index < directories.length) {
            return this._isParent(file.parents[0], directories, index++);
          } else {
            debug('parent %s (%s) matches directory tree %s', file.id, file.name, directories);
            return true;
          }
        } else {
          if (file.name == ROOT_NAME_DRIVE && (index >= directories.length || !directories.length)) {
            debug('parent %s (%s) matches directory tree %s', file.id, file.name, directories);
            return true;
          } else {
            debug('parent %s (%s) does not match directory tree %s', file.id, file.name, directories);
            return false;
          }
        }
      });
  }
}
