import ChangeQueue from './change-queue.js';
import isNetworkError from '../cloud/is-network-error.js';
import Bacon from 'baconjs';
import Encryption from '../encryption.js';
import fs from 'fs';
import ChangeRunner from './change-runner.js';
import FileWorker from '../file-worker.js';
import Settings from '../settings.js';
import appEvents, {
  actions
} from '../events.js';

const EventEmitter = require('events');

let log = require('../debug.js')('syncmanager');

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

    this._uploadHistory = new Map();
    this._downloadHistory = new Map();
    this._restoringLastHistory();
  }

  startWatching() {
    this.startUpload();
    this.startDownload();
    this._startFetchInterval();
  }

  startUpload() {
    if (!this._uploadRunner) {
      this._uploadRunner = new ChangeRunner({
        queue: this._uploadQueue,
        callback: this.nextUpload,
        callbackObject: this,
        beforeChange: (change) => {
          appEvents.emit(actions.UPLOADING, change);
        },
        afterChange: change => {
          appEvents.emit(actions.UPLOAD_DONE, change);
        },
        afterAll: () => {
          appEvents.emit(actions.UPLOADS_DONE);
        },
        concurrencyLimit: 1,
        checkFrequency: 300
      });
    }
    this._uploadRunner.start();
  }

  startDownload() {
    if (!this._downloadRunner) {
      this._downloadRunner = new ChangeRunner({
        queue: this._downloadQueue,
        callback: this.nextDownload,
        callbackObject: this,
        beforeChange: (change) => {
          appEvents.emit(actions.DOWNLOADING, change);
        },
        afterChange: change => {
          appEvents.emit(actions.DOWNLOAD_DONE, change);
        },
        afterAll: () => {
          appEvents.emit(actions.DOWNLOADS_DONE);
        },
        concurrencyLimit: 1
      });
    }
    this._downloadRunner.start();
  }

  stopDownload() {
    this._downloadRunner.stop();
  }

  stopUpload() {
    this._uploadRunner.stop();
  }

  stopWatching() {
    this._stopFetchInterval();
    this.stopUpload();
    this.stopDownload();
  }

  pushUpload(change) {
    if (change && change.path && !change.path.endsWith(DOWNLOAD_SUFFIX)) {
      if (!change.pathOrigin || change.pathOrigin && !change.pathOrigin.endsWith(DOWNLOAD_SUFFIX)) {
        appEvents.emit(actions.DETECT_UPLOAD, change);
        this._uploadQueue.push(change);
      }
    }
  }

  async nextUpload(change) {
    return new Promise((resolve, reject) => {
      let provider = this._getProvider();
      let key = this._createHistoryKey(change.action, this._removeWatchHome(change.path));
      let isRelevant = this._downloadHistory.get(key) == null;

      if (isRelevant) {
        let promise = this._doUpload(provider, change, reject);
        if (!promise) {
          reject();
        } else {
          promise
            .then(then => {
              this._addUploadToHistory(provider, change)
                .then(() => resolve(then))
                .catch(reject);
            })
            .catch(err => {
              reject(err)
            });
        }
      } else {
        log.debug('Ignoring %s for upload', key);
        this._downloadHistory.delete(key);
        resolve();
      }
    });
  }

  _doUpload(provider, file, error) {
    let promise;
    switch (file.action) {
      case 'ADD':
      case 'CHANGE':
        promise = this._uploadAddOrChange(provider, file, error);
        break;
      case 'MOVE':
        promise = this._uploadMove(provider, file, error);
        break;
      case 'REMOVE':
        promise = this._uploadRemove(provider, file, error);
        break;
      default:
        promise = Promise.reject('Upload impossible. Unknown change type ' + file.action);
    }
    return promise;
  }

  _uploadAddOrChange(provider, file, reject) {
    let promise;
    let targetPath = this._removeWatchHome(file.path);

    if (file.isDir) {
      log.info('[Upload] Creating folder %s', targetPath);

      promise = provider.createFolder(targetPath);
    } else {
      log.info('[Upload] Uploading file %s', targetPath);

      let upstream = this._createReadStream(file.path, reject);
      promise = provider.upload(upstream, targetPath);
    }
    //TODO: what if 2 folder created in one request? not handled so far
    promise = Bacon
      .fromPromise(promise)
      .flatMap(done => Bacon.fromPromise(provider.postUpload(file, done)).flatMap(() => done))
      .toPromise();

    return promise;
  }

  _uploadMove(provider, file, reject) {
    let targetPath = this._removeWatchHome(file.path);
    let fromPath = this._removeWatchHome(file.pathOrigin);

    log.info('[Upload] Moving %s to %s', fromPath, targetPath);

    return Bacon
      .fromPromise(provider.move(fromPath, targetPath))
      .flatMap(done => Bacon.fromPromise(provider.postMove(file, done)).flatMap(() => done))
      .toPromise();
  }

  _uploadRemove(provider, file, reject) {
    let targetPath = this._removeWatchHome(file.path);

    log.info('[Upload] Removing %s', targetPath);

    return Bacon
      .fromPromise(provider.remove(targetPath))
      .flatMap(done => Bacon.fromPromise(provider.postRemove(file, done)).flatMap(() => done))
      .toPromise();
  }

  async nextDownload(file) {
    let promise;

    if (file.path) {
      this._addDownloadToHistory(file);

      if (file.action == 'MOVE' && file.pathOrigin) {
        promise = this._downloadMove(file);

      } else if (file.action == 'REMOVE') {
        promise = this._downloadRemove(file);

      } else if (file.action == 'ADD' && file.isDir) {
        promise = this._downloadCreateDir(file);

      } else if ((file.action == 'ADD' || file.action == 'CHANGE') && file.provider) {

        promise = this._downloadAddOrChange(file);
      } else {
        log.info('Invalid data %s', file);
      }
    } else {
      log.info('Invalid data %s', file);
    }

    return promise;
  }

  async _downloadAddOrChange(file) {
    let location = this._prefixWithWatchHome(file.path);
    let provider = await this._getProviderById(file.provider);

    log.info('[Download] Adding or updating file %s', location);

    return new Promise((resolve, reject) => {
      Bacon.fromPromise(this._createWriteStream(location, reject))
        .flatMap(download => {
          return Bacon.fromPromise(provider.download(download.stream, file))
            .flatMap(done => Bacon.fromPromise(provider.postDownload(file, done)).flatMap(() => done))
            .flatMap(done => Bacon.fromPromise(this._finishDownload(download.location, file.timestamp)).flatMap(() => done))
        })
        .toPromise().then(resolve).catch(reject);
    });
  }

  _downloadCreateDir(file) {
    let location = this._prefixWithWatchHome(file.path);

    log.info('[Download] Adding directory %s', location);
    return this._fileWorker.createDirectory(location);
  }

  _downloadMove(file) {
    let pathTo = this._prefixWithWatchHome(file.path);
    let pathFrom = this._prefixWithWatchHome(file.pathOrigin);

    log.info('[Download] Moving %s to %s', pathFrom, pathTo);
    return this._fileWorker.move(pathFrom, pathTo);
  }

  _downloadRemove(file) {
    let location = this._prefixWithWatchHome(file.path);

    log.info('[Download] Removing %s', location);
    return this._fileWorker.remove(location);
  }

  _finishDownload(location, timestamp) {
    log.info(location, timestamp);
    return this._fileWorker.markDownloadAsDone(location, timestamp);
  }

  _fetchChanges() {
    let fetch = Bacon.fromArray(this.providers)
      .flatMap(provider => {
        return Bacon.fromPromise(provider.accountId())
          .flatMap(providerId => {

            let uploads = this._uploadHistory.get(providerId);
            if (!uploads) uploads = [];
            this._uploadHistory.set(providerId, []);

            return Bacon.fromPromise(provider.pullChanges())
              .doAction(changes => log.debug('Provider %s fetched %s changes', provider.providerName(), changes.length))
              .flatMap(changes => {
                return Bacon.fromArray(changes)
                  .filter(change => this._filterPullChange(change, uploads))
                  .fold([], (array, change) => {
                    array.push(change);
                    return array;
                  });
              })
              .flatMap(changes => Bacon.fromArray(changes))
              .flatMap(change => {
                /*
                 * Store provider in field 'provider'
                 * so that download process can identify corresponding provider.
                 */
                log.debug('Got change %s', change);

                appEvents.emit(actions.DETECT_DOWNLOAD, change);
                change.provider = providerId;
                this._downloadQueue.push(change);
              })
          });
      });

    fetch.onError(err => log.error('Error occurred in fetching for changes', err, err.stack));
    return new Promise((resolve, reject) => {
      fetch.onEnd(resolve);
    });
  }

  _filterPullChange(file, uploads) {
    let key = this._createHistoryKey(file.action, file.path);
    let found = false;
    for (let i = 0; i < uploads.length; i++) {
      let element = uploads[i];
      log.info('Filtering %s with entry in uploads %s', key, element.key);
      if (key == element.key) {
        found = true;
        break;
      }
    }
    log.debug('Check if %s is relevant to download: %s', file.path, !found);
    return !found;
  }

  _createHistoryKey(action, location) {
    if (action == 'CHANGE') {
      action = 'ADD';
    }
    return action = action + location;
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

  _addUploadToHistory(provider, file) {
    return Bacon.fromPromise(provider.accountId())
      .flatMap(providerId => {
        let key = this._createHistoryKey(file.action, this._removeWatchHome(file.path));
        let uploads = this._uploadHistory.get(providerId);
        if (!uploads) uploads = [];

        uploads.push({
          key: key,
          file: file
        });

        this._uploadHistory.set(providerId, uploads);
      }).toPromise();
  }

  _addDownloadToHistory(file) {
    let key = this._createHistoryKey(file.action, file.path);
    this._downloadHistory.set(key, file);
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

  _removeWatchHome(location) {
    return location.replace(this.watchHome, '/');
  }


  _getProvider() {
    // challenges for distribution strategy
    // how to handle new folder change events among providers?
    // - track which provider stores what file?
    // how to make sure to delete all files within a folder remove
    return this.providers.length ? this.providers[0] : null;
  }

  _restoringLastHistory() {
    const UPLOAD_HIST = 'SYNC_MANAGER_UPLOAD_HIST';
    const DOWNLOAD_HIST = 'SYNC_MANAGER_DOWNLOAD_HIST';

    Settings.unmarshall(UPLOAD_HIST)
      .then(hist => {
        this._uploadHistory = new Map(hist);
      }).catch(log.error);

    Settings.unmarshall(DOWNLOAD_HIST)
      .then(hist => {
        this._downloadHistory = new Map(hist);
      }).catch(log.error);

    process.on('SIGINT', () => {
      Settings.marshall(UPLOAD_HIST, this._uploadHistory);
      Settings.marshall(DOWNLOAD_HIST, this._downloadHistory);

      setTimeout(() => NaN)
    }, 5000);
  }
}
