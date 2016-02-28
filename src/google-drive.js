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

  searchFiles(name, trashed = false, nextPageToken = null) {
    let options = {
      q: `name='${name}' and trashed = ${trashed}`,
      fields: 'nextPageToken, files(id, name, parents)'
    }

    if (nextPageToken) {
      options.pageToken = nextPageToken;
    }
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

  _ensureFoldersAreCreated(basedir) {

  }

  _isParent(parentId, tree, index) {
    return this.getFileInfo(parentId)
      .then(file => {
        if (file.name == tree[index]) {
          if (file.parents.length && index < tree.length) {
            return this._isParent(file.parents[0], tree, index++);
          } else {
            debug('parent %s (%s) matches directory tree %s', file.id, file.name, tree);
            return true;
          }
        } else {
          if (file.name == ROOT_NAME_DRIVE && (index >= tree.length || !tree.length)) {
            debug('parent %s (%s) matches directory tree %s', file.id, file.name, tree);
            return true;
          } else {
            debug('parent %s (%s) does not match directory tree %s', file.id, file.name, tree);
            return false;
          }
        }
      });
  }
}
