var google = require('googleapis');
var path = require('path');
var Promise = require('bluebird');
import fs from 'fs';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

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
    let f = this.getFilesByName('cd01_artist - Track 1.mp3');

    console.log(f);
    f.then(o => console.log('then', JSON.stringify(o, 4)));

    let options = {
      resource: {
        name: path.basename(upload.path)
      },
      media: {
        body: fs.createReadStream(upload.path) // todo encryption
      },
      fields: 'id'
    };

    return Promise.promisify(this.drive.files.create)(options)
      .then(response => {
        console.log(response);
        return response;
      })
      .catch(function(err) {
        console.log('err', err);
      });
  }

  getFileIdByPath(upload) {
    let parents = upload.path.replace(this.watchHomeDir, '').split('/');
    let basename = parents.pop();
    let parentsShifted = parents.shift();

    this.getFilesByName(basename).then(result => {
      let files = result.files;
      if (files.length == 1) {
        return files[0].id;
      } else if (files.length > 1) {
        for(let i = 0; i < files.length; i++) {
          let file = files[i];
          let parents = file.parents;
          console.log('parents.length: ', parents.length);

          if (!parents.length || !parentsShifted.length) {
            continue;
          }

          let parent = parents[0];
          this.isParent(parent.id, parentsShifted, 0)
            .then(isParent => {

            });
        });
      }
    });
  }

  isParent(parentId, tree, index) {
    return this.getFileInfo(parentId).then(file => {
      if (file.name == tree[index]) {
        if (file.parents.length && index < tree.length) {
          console.log('parents.length', file.parents.length);
          index++;
          return isParent(file.parent[0].id, tree, index);
        } else {
          return true;
        }
      } else {
        return false;
      }
    });
  }

  getFileInfo(fileId) {
    let options = {
      fileId: fileId;
    }
    return Promise.promisify(this.drive.files.get)(options);
  }




  getFilesByName(name, nextPageToken = null) {
    let options = {
      q: `name='${name}'`,
      trashed: false,
      fields: 'nextPageToken, files(id, name, parents)'
    }
    if (nextPageToken) {
      options.pageToken = nextPageToken;
    }
    return Promise.promisify(this.drive.files.list)(options);
  }

  //id: '0B9MT6owYhA0DMXJpeGY3MUNJMGc',
  //name: 'bean-test',
  createFolder(name) {
    let options = {
      resource: {
        name: name,
        mimeType: FOLDER_MIME_TYPE
      }
    }

    return Promise.promisify(this.drive.files.create)(options)
      .then(response => {
        console.log(response);
        return response;
      })
      .catch(function(err) {
        console.log('err', err);
        return err;
      });
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
        return this.doAdd(upload);
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
}
