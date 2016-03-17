import ChangeQueue from './change-queue.js';
import isNetworkError from './cloud/is-network-error.js';
import Bacon from 'baconjs';
import Encryption from './encryption.js';
import fs from 'fs';
import ChangeRunner from './change-runner.js';
import FileWorker from './file-worker.js';
const EventEmitter = require('events');

let log = require('./debug.js')('syncmanager');

const UPLOAD_CONCURRENCY_LIMIT = 1;
const DOWNLOAD_CONCURRENCY_LIMIT = 1;
const DOWNLOAD_SUFFIX = '.syncdownload';
const ENCRYPTION_SUFFIX = '.enc';

export default class SyncManager extends EventEmitter {

  constructor(options = {}) {
    super();
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
    log.info(change);
    if (change && change.path && !change.path.endsWith(DOWNLOAD_SUFFIX)) {
      if (!change.pathOrigin || change.pathOrigin && !change.pathOrigin.endsWith(DOWNLOAD_SUFFIX)) {
        this._uploadQueue.push(change);
      }
    }
  }

  async nextUpload(change) {
    return new Promise((resolve, reject) => {
      let provider = this._getProvider();
      let stream = null;

      if (!change.isDir) {
        stream = this._createReadStream(change.path, reject);
      }
      if (change.isDir || stream) {
        let promise = this._doUpload(provider, change, stream);
        if (!promise) {
          reject();
        } else {
          promise.then(resolve).catch(reject);
        }
      } else {
        log.error('Skipping upload %s wrong data [%s]', change.path, change);
        return null;
      }
    });
  }

  _doUpload(provider, file, upstream) {
    let targetPath = file.path.replace(this.watchHome, '/');
    let promise;

    log.info('Uploading %s %s', file.action, file.path);
    switch (file.action) {
      case 'ADD':
      case 'CHANGE':
        if (file.isDir) {
          log.info('[Upload] Creating folder %s', targetPath);
          promise = provider.createFolder(targetPath);
        } else {
          log.info('[Upload] Uploading file %s', targetPath);
          promise = provider.upload(upstream, targetPath);
        }
        //TODO: what if 2 folder created in one request? not handled so far
        promise = Bacon
          .fromPromise(promise)
          .flatMap(done => Bacon.fromPromise(provider.postUpload(file, done)).flatMap(() => done))
          .toPromise();
        break;
      case 'MOVE':
        let fromPath = file.pathOrigin.replace(this.watchHome, '');

        log.info('[Upload] Moving %s to %s', fromPath, targetPath);
        promise = Bacon
          .fromPromise(provider.move(fromPath, targetPath))
          .flatMap(done => Bacon.fromPromise(provider.postMove(file, done)).flatMap(() => done))
          .toPromise();
        break;
      case 'REMOVE':

        log.info('[Upload] Removing %s', targetPath);
        promise = Bacon
          .fromPromise(provider.remove(targetPath))
          .flatMap(done => Bacon.fromPromise(provider.postRemove(file, done)).flatMap(() => done))
          .toPromise();
        break;
      default:
        log.error('Upload impossible. Unknown change type %s [%s]', file.action, file);
    }
    return promise;
  }

  async nextDownload(file) {
    let promise;

    // IDEA: store all changes at a persistent place
    // only add new change to pushUpload if it is not stored
    // hash necessary to detect if change was made by download or user
    // this covers the DOWNLOAD -> not UPLOAD again scenario

    // IDEA: UPLOAD -> not DOWNLOAD again scenario:
    // upload -> returns any identifier
    // download: uses upload identifier to determine if change is relevant
    // expiration of upload identifier?
    // utility to mark a changes as covered

    log.trace(file);

    if (file.path) {
      let pathPrefixed = this._prefixWithWatchHome(file.path);
      if (file.action == 'MOVE' && file.pathOrigin) {
        log.info('[Download] Moving %s to %s', file.pathOrigin, pathPrefixed);
        let pathFrom = this._prefixWithWatchHome(file.pathOrigin);
        promise = this._fileWorker.move(pathFrom, pathPrefixed);

      } else if (file.action == 'REMOVE') {
        log.info('[Download] Removing %s', pathPrefixed);
        promise = this._fileWorker.remove(pathPrefixed);

      } else if (file.action == 'ADD' && file.isDir) {
        log.info('[Download] Adding directory %s', pathPrefixed);
        promise = this._fileWorker.createDirectory(pathPrefixed);

      } else if ((file.action == 'ADD' || file.action == 'CHANGE') && file.provider) {
        log.info('[Download] Adding or updating file %s', pathPrefixed);
        promise = this._doDownload(file, pathPrefixed);

      } else {
        log.info('Invalid data %s', file);
      }
    } else {
      log.info('Invalid data %s', file);
    }
    return promise;
  }

  async _doDownload(file, location) {
    let provider = await this._getProviderById(file.provider);

    return new Promise((resolve, reject) => {
      Bacon.fromPromise(this._createWriteStream(location, reject))
        .flatMap(download => {
          log.info('Downloading ', download);
          return Bacon.fromPromise(provider.download(download.stream, file))
            .flatMap(done => Bacon.fromPromise(provider.postDownload(file, done)).flatMap(() => done))
            .flatMap(done => Bacon.fromPromise(this._finishDownload(download.location)).flatMap(() => done))
        })
        .toPromise().then(resolve).catch(reject);
    });
  }

  _finishDownload(target) {
    return this._fileWorker.markDownloadAsDone(target);
  }

  _fetchChanges() {
    let fetch = Bacon.fromArray(this.providers)
      .flatMap(provider => {
        return Bacon.fromPromise(provider.accountId())
          .flatMap(providerId => {

            return Bacon.fromPromise(provider.pullChanges())
              .doAction(changes => log.info('Provider %s fetched %s changes', provider.providerName(), changes.length))
              .flatMap(changes => Bacon.fromArray(changes))
              .flatMap(change => {
                /*
                 * Store provider in field 'provider'
                 * so that download process can identify corresponding provider.
                 */
                change.provider = providerId;
                this._downloadQueue.push(change);
              })
          });
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

  _createReadStream(location, error) {
    let stream = fs.createReadStream(location);
    stream.on('error', error);

    if (this.useEncryption) {
      return this.encryption.encryptStream(stream, error)
        .on('error', error);
    } else {
      return stream;
    }
  }

  _createWriteStream(location, error) {
    return Bacon.fromPromise(this._fileWorker.createDownloadStream(location, error))
      .flatMap(download => {
        if (this.useEncryption) {
          let enc = this.encryption.decryptStream(download.stream, error);
          enc.on('error', error);
          download.stream = enc;
          return download;
        } else {
          return download;
        }
      }).toPromise();
  }

  async _getProviderById(id) {
    let cached = this._providerMap.get(id);
    if (cached) {
      return Bacon.once(cached).toPromise();
    } else {
      return Bacon.fromArray(this.providers)
        .flatMap(provider => {
          return Bacon.fromPromise(provider.accountId())
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
    let endIndex = this.watchHome.lastIndexOf('/', this.watchHome.length - 1);
    let basepath = this.watchHome.substr(0, endIndex);
    return `${basepath}/${location}`;
  }

  _getProvider() {
    // challenges for distribution strategy
    // how to handle new folder change events among providers?
    // - track which provider stores what file?
    // how to make sure to delete all files within a folder remove
    return this.providers.length ? this.providers[0] : null;
  }
}
