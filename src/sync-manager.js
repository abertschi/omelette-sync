import ChangeQueue from './change-queue.js';
import isNetworkError from './cloud/is-network-error.js';
import Bacon from 'baconjs';
import Encryption from './encryption.js';
import fs from 'fs';
import Providers from './cloud/providers.js';
import ChangeRunner from './change-runner.js';

let debug = require('debug')('bean:app');

const ENCRYPTED_ENDING = '.enc';
const UPLOAD_CONCURRENCY_LIMIT = 1;
const DOWNLOAD_CONCURRENCY_LIMIT = 1;

export default class SyncManager {

  constructor(options = {}) {
    this.providers = options.providers || [];

    this.uploadStrategy = options.uploadStrategy || 'first-full'; /// 'distribute'
    this.watchHome = options.watchHome;
    if (options.encryption) {
      this.useEncryption = true;
      this.encryptFileNames = options.encryption.encryptFilenames;
      this.password = options.encryption.password;
    } else {
      this.useEncryption = false;
    }

    this._uploadQueue = new ChangeQueue({
      tablename: 'UPLOAD_QUEUE'
    });
    this._downloadQueue = new ChangeQueue({
      tablename: 'DOWNLOAD_QUEUE'
    });

    this.encryptor = new Encryption({
      password: this.password
    });

    if (!this.watchHome) {
      throw new Error('No watch home dir');
    }
  }

  start() {
    if (!this._uploadRunner) {
      this._uploadRunner = new ChangeRunner({
        queue: this._uploadQueue,
        callback: this.nextUpload,
        callbackObject: this,
        concurrencyLimit: 1
      });
      this._downloadRunner = new ChangeRunner({
        queue: this._downloadQueue,
        callback: this.nextDownload,
        callbackObject: this,
        concurrencyLimit: 1
      });
    }
    this._uploadRunner.start();
    this._downloadRunner.start();
  }

  stop() {
    this._uploadRunner.stop();
    this._downloadRunner.stop();
  }

  pushUpload(change) {
    this._uploadQueue.push(change);
  }

  async nextUpload(change) {
    let provider = this._getProvider();
    return provider.doUpload(change);
  }

  async _nextDownload(change) {
    debug('downloading: ', change);
    return null;
  }

  _createReadStream(location) {
    let stream = fs.createReadStream(location);
    if (this.useEncryption) {
      return this.encryption.encryptStream(stream);
    } else {
      return stream;
    }
  }

  _createWriteStream(location) {
    let stream = fs.createWriteStream(location);
    if (this.useEncryption) {
      return this.encryption.decryptStream(stream);
    } else {
      return stream;
    }
  }

  _getProvider() {
    // challenges for distribution strategy
    // how to handle new folder change events among providers?
    // - track which provider stores what file?
    // how to make sure to delete all files within a folder remove
    return this.providers.length ? this.providers[0] : null;
  }
}
