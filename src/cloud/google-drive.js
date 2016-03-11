import GoogleDriveApi from './google-drive-api.js';
let debug = require('debug')('bean:app');
import fs from 'fs';
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
    this.watchHome = options.watchHome;

    let stream = fs.createWriteStream('/tmp/download.txt');
    this.drive.getStorage()
      .then(e => debug('done', JSON.stringify(e)))
      .catch(e => debug('error', e));
  }

  doUpload(file, upstream) {
    debug(file);
    let targetPath = file.path.replace(this.watchHome, '');
    let promise;

    switch (file.action) {
      case 'ADD':
      case 'CHANGE':
        if (file.isDir) {
          promise = this.drive.createFolder(targetPath);
          promise.then(done => {
            debug('INTERCEPTED THEN', done);
            return done;
          });
        } else {
          promise = this.drive.upload(upstream, targetPath);
        }
        break;
      case 'MOVE':
        let fromPath = file.pathOrigin.replace(this.watchHome, '');
        promise = this.drive.move(fromPath, targetPath);
        break;
      case 'REMOVE':
        promise = this.drive.remove(targetPath);
        break;
      default:
        debug('Unknown change type', file);
    }
    return promise;
  }

  pullChanges() {
    let lastPageToken = null;
    return Bacon.fromPromise(this.drive.listChanges(lastPageToken))
      .flatMap(changes => {
        return Bacon.fromArray(changes.changes)
          .flatMap(change => {
            debug(change);
          });
      });
  }

  doDownload(file) {

  }

  _detectChange(change) {
    // possible changes:
    // 1. add: id is not found in index
    // 2. move: parent id does not match parentId in index
    // 3. rename: name changed
    // 4. remove: detetected by API
  }

}
