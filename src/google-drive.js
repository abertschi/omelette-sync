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

  getFileInfo(fileId) {
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
    if (parms.nextPageToken)
      options.pageToken = parms.nextPageToken;
    if (parms.onRoot)
      options.q = options.q + " and 'root' in parents";
    if (parms.withParentId)
      options.q = options.q + `and '${parms.withParentId}' in parents`;

    let trashed = options.includeTrashed ? true : false;
    options.q = options.q + ` and trashed = ${trashed}`;


    debug(options);
    return Promise
      .promisify(this.drive.files.list)(options);
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
    let childdirs = basedir.split('/').filter(a => a.trim() != '');
    debug('Creating folders [%s]', childdirs);
    let index = 0;
    return this._createFolders(null, childdirs, index)
      .then(success => {
        debug('folders %s created. child id: %s', basedir, success.id);
        return success.id;
      });
  }

  _createFolders(parentId, directories, directoryIndex) {
    debug('Creating folders recursively. Now for %s [out of %s with index %s]', parentId, directories, directoryIndex);
    return Bacon.fromPromise(this.createFolder(directories[directoryIndex], parentId))
      .flatMap(successful => {
        directoryIndex++;
        if (directoryIndex < directories.length) {
          return Bacon.fromPromise(this._createFolders(successful.id, directories, directoryIndex));
        } else {
          debug('All folders [%s] created. child id: %s', directories, successful.id);
          return Bacon.once(successful);
        }
      }).toPromise();
  }

  createFolder(folderName, parentId = null) {
    let searchArgs = {};
    if (parentId)
      searchArgs.withParentId = parentId;
    else
      searchArgs.onRoot = true;

    return this.searchFiles(folderName, searchArgs)
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

        return Promise.promisify(this.drive.files.create)(options);
      });
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
