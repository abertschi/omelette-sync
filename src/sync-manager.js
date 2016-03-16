import ChangeQueue from './change-queue.js';
import isNetworkError from './cloud/is-network-error.js';
import Bacon from 'baconjs';
import Encryption from './encryption.js';
import fs from 'fs';
import ChangeRunner from './change-runner.js';
import FileWorker from './file-worker.js';

let log = require('./debug.js')('syncmanager');

const UPLOAD_CONCURRENCY_LIMIT = 1;
const DOWNLOAD_CONCURRENCY_LIMIT = 1;
const DOWNLOAD_SUFFIX = '.syncdownload';
const ENCRYPTION_SUFFIX = '.enc';

export default class SyncManager {

  constructor(options = {}) {
    this.providers = options.providers || [];
    this.fetchIntervalTime = options.fetchInterval || 10000;
    this.uploadStrategy = options.uploadStrategy || 'first-full'; /// 'distribute'
    this.downloadSuffix = options.downloadSuffix || DOWNLOAD_SUFFIX;

    if (options.encryption) {
      this.useEncryption = true;
      this.encryptFileNames = options.encryption.encryptFilenames;
      this.password = options.encryption.password;
    } else {
      this.useEncryption = false;
    }

    if (options.watchHome && !options.watchHome.endsWith('/')) {
      this.watchHome = options.watchHome + '/';
    } else {
      this.watchHome = options.watchHome;
    }

    this._fileWorker = new FileWorker();
    this._fetchInterval;
    this._providerMap = new Map();

    this._uploadQueue = new ChangeQueue({
      tablename: 'UPLOAD_QUEUE'
    });
    this._downloadQueue = new ChangeQueue({
      tablename: 'DOWNLOAD_QUEUE'
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
    return new Promise((resolve, reject) => {
      let provider = this._getProvider();
      let stream = null;

      if (!change.isDir) {
        stream = this._createReadStream(change.path, reject);
      }
      if (change.isDir || stream) {
        log.info('Uploading %s', change.path);
        provider.doUpload(change, stream)
          .then(resolve)
          .catch(reject);
      } else {
        log.error('Skipping upload %s wrong data', change.path);
        return null;
      }
    });
  }

  finishDownload(target) {
    let source = path + DOWNLOAD_SUFFIX;
    return this.move(source, target);
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

  _prefixWithWatchHome(location) {
    /*
     * Example of watchHome: /home/abertschi/Drive/ (always '/' at the end)
     * Example of location : /folder/myfile.txt (always '/' at the start)
     * In order to combine watchHome with location,
     * 1 directory of watchHome must be removed.
     */
    if (location.startsWith('/')) {
      location = location.substr(1);
    }
    let endIndex = this.watchHome.lastIndexOf('/', this.watchHome.length -1 );
    let basepath = this.watchHome.substr(0, endIndex);
    return `${basepath}/${location}`;
  }

  async nextDownload(file) {
    let promise;

    if (file.path) {
      let pathPrefixed = this._prefixWithWatchHome(file.path);

      if (file.action == 'MOVE' && file.pathOrigin) {
        log.info('Moving %s to %s', file.pathOrigin, pathPrefixed);
        let pathFrom = this._prefixWithWatchHome(file.pathOrigin);
        promise = this._fileWorker.move(pathFrom, pathPrefixed);

      } else if (file.action == 'REMOVE') {
        log.info('Removing %s', pathPrefixed);
        promise = this._fileWorker.remove(pathPrefixed);

      } else if (file.action == 'ADD' && file.isDir) {
        log.info('Adding directory %s', pathPrefixed);
        promise = this._fileWorker.createDirectory(pathPrefixed);

      } else if (file.action == 'ADD' || file.action == 'CHANGE') {
        log.info('Adding or updating file %s', pathPrefixed);
        let provider = await this._getProviderById(file.provider);
        promise = new Promise((resolve, reject) => {
          let writeStream = this._createWriteStream(pathPrefixed, reject);
          let done = provider.doDownload(file, writeStream);
          if (!done) {
            resolve();
          } else {
            done.then(resolve).catch(reject);
          }
        });
      } else {
        log.error('Invalid data %s', file);
      }
    } else {
      log.error('Invalid data %s', file);
    }
    return promise;
  }

  _fetchChanges() { // TODO: do not refetch if previous fetching not yet done
    let fetch = Bacon.fromArray(this.providers)
      .flatMap(provider => {
        return Bacon.fromPromise(provider.getProvider().getUserId())
          .flatMap(providerId => {
            return Bacon.fromPromise(provider.pullChanges())
              .doAction(changes => log.debug('provider %s fetched %s changes', providerId, changes.length))
              .flatMap(changes => Bacon.fromArray(changes))
              .flatMap(change => {
                change.provider = providerId;
                this._downloadQueue.push(change);
              })
          })
      });

    fetch.onError(err => log.error('Error occurred in fetching for changes', err));
    return new Promise((resolve, reject) => {
      fetch.onEnd(resolve);
    });
  }

  _startFetchInterval() {
    // TODO: check internet connectivity before calling providers
    let working = false;
    this._fetchInterval = setInterval(() => {
      if (!working) {
        working = true;
        this._fetchChanges()
          .then(() => working = false)
          .catch(() => working = false);
      }
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

  _createReadStream(location, error) {
    let stream = fs.createReadStream(location);
    stream.on('error', error);

    if (this.useEncryption) {
      return this.encryption.encryptStream(stream)
        .on('error', error);
    } else {
      return stream;
    }
  }

  _createWriteStream(location, error) {
    let stream = fs.createWriteStream(location); //TODO: suffix?
    stream.on('error', error);

    if (this.useEncryption) {
      let enc = this.encryption.decryptStream(stream);
      enc.on('error', error);
      return enc;
    } else {
      return stream;
    }
  }
}
