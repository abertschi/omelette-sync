import ChangeQueue from './change-queue.js';
import isNetworkError from './cloud/is-network-error.js';
import Bacon from 'baconjs';
import Encryption from './encryption.js';
import fs from 'fs';
import ChangeRunner from './change-runner.js';

let debug = require('debug')('bean:app');

const ENCRYPTED_ENDING = '.enc';
const UPLOAD_CONCURRENCY_LIMIT = 1;
const DOWNLOAD_CONCURRENCY_LIMIT = 1;
const DOWNLOAD_SUFFIX = '.download';

export default class SyncManager {

  constructor(options = {}) {
    this.providers = options.providers || [];
    this.fetchIntervalTime = options.fetchInterval || 10000;

    this.uploadStrategy = options.uploadStrategy || 'first-full'; /// 'distribute'
    this.watchHome = options.watchHome;
    if (options.encryption) {
      this.useEncryption = true;
      this.encryptFileNames = options.encryption.encryptFilenames;
      this.password = options.encryption.password;
    } else {
      this.useEncryption = false;
    }

    this._fetchInterval;
    this._providerMap = new Map();

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
    this._startFetchInterval();
  }

  stop() {
    this._uploadRunner.stop();
    this._downloadRunner.stop();
    this._stopFetchInterval();
  }

  pushUpload(change) {
    this._uploadQueue.push(change);
  }

  async nextUpload(change) {
    let provider = this._getProvider();
    let stream = null;
    if (!change.isDir) {
      stream = this._createReadStream(change.path);
    }
    if (change.isDir || stream) {
      return provider.doUpload(change, stream);
    } else {
      debug('Skipping upload %s wrong data', change.path);
      return null;
    }
  }

  async _getProviderById(id) {
    let cached = this._providerMap.get(id);
    if (cached) {
      return Bacon.once(cached).toPromise();
    } else {
      return Bacon.fromArray(this.providers)
        .flatMap(provider => {
          return Bacon.fromPromise(provider.getProvider().getUserId())
            .flatMap(providerId => {
              this._providerMap.set(providerId, provider);
              if (providerId == id) {
                return provider;
              }
            });
        }).toPromise();
    }
  }

  async nextDownload(file) {
    debug('new download for %s', file.path);

    let promise;
    switch (file.action) {
      case 'MOVE':
        debug('Moving %s to %s', file.pathOrigin, file.path); // TODO: impl
        break;
      case 'REMOVE':
        debug('Removing %s', file.path);
        break;
      default:
        if (file.action == 'ADD' && file.isDir) {
          debug('Creating directory %s', file.path);
        } else {
          debug('Downloading file %s', file.path);
          let provider = await this._getProviderById(file.provider);
          let writeStream = null; //this._createWriteStream(file.path);
          promise = provider.doDownload(file, writeStream);
        }
    }
    return promise;
  }

  _fetchChanges() {
    Bacon.fromArray(this.providers)
      .flatMap(provider => {
        return Bacon.fromPromise(provider.getProvider().getUserId())
          .onValue(providerId => {
            provider.pullChanges()
              .then(changes => {
                debug('provider %s fetched %s changes', providerId, changes.length);
                changes.forEach(change => {
                  change.provider = providerId;
                  this._downloadQueue.push(change);
                  debug('Pushed download (%s) to queue of %s', change.path, change.provider);
                });
              }).catch(err => {
                debug('Error occurred in fetching changes for provider %s', providerId, err);
              });
          });
      }).onValue();
  }

  _createReadStream(location) {
    try {
      let stream = fs.createReadStream(location);
      stream.on('error', (err) => {
        debug('Error in reading file %s', location, err);
      });
      if (this.useEncryption) {
        return this.encryption.encryptStream(stream);
      } else {
        return stream;
      }
    } catch (err) {
      debug('Error in reading file %s', location, err);
    }
  }

  _createWriteStream(location) {
    let stream = fs.createWriteStream(location + DOWNLOAD_SUFFIX);
    if (this.useEncryption) {
      return this.encryption.decryptStream(stream);
    } else {
      return stream;
    }
  }

  _startFetchInterval() {
    // TODO: check internet connectivity before calling providers
    this._fetchInterval = setInterval(() => {
      this._fetchChanges();
    }, this.fetchIntervalTime);
  }

  _stopFetchInterval() {
    clearInterval(this._fetchInterval);
  }

  _getProvider() {
    // challenges for distribution strategy
    // how to handle new folder change events among providers?
    // - track which provider stores what file?
    // how to make sure to delete all files within a folder remove
    return this.providers.length ? this.providers[0] : null;
  }
}
