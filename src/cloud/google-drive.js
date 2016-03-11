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
    
  }

  doDownload(file) {

  }

}
