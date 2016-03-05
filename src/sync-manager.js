import uploadQueue from './upload-queue.js';
import isNetworkError from './cloud/is-network-error.js';
let debug = require('debug')('bean:app');
import Bacon from 'baconjs';

export default class SyncManager {

  constructor(options = {}) {
    this.providers = options.providers || [];
    this.strategy = options.strategy || 'first-full'; // 'distribute'
    this.watchHome = options.watchHome;
    this.uploadsAtOnce = options.uploadsAtOnce || 7;
    this._running = false;
    this.started = false;
    this.bufferSize = 0;

    if (!this.watchHome) {
      throw new Error('No watch home dir');
    }

    uploadQueue.on('empty', () => {
      this._running = false;
    });

    uploadQueue.on('not-empty', () => {
      if (!this._running) {
        this._running = true;
        this._check_running();
      }
    });

    //TODO: getFlaggedAsActive to restore not successful uploads
  }

  getProvider() {
    // challenges for distribution strategy
    // how to handle new folder change events among providers?
    // - track which provider stores what file?
    // how to make sure to delete all files within a folder remove
    return this.providers.length ? this.providers[0] : null;
  }


  async _run() {
    debug('new iteration');
    if (this._running && this.bufferSize < this.uploadsAtOnce) {
      this.bufferSize++;

      let upload;
      if (this.uploadsFromLastRun.length) {
        upload = this.uploadsFromLastRun.pop();
      } else {
        upload = await uploadQueue.peek();
      }

      if (upload) {
        let targetPath = upload.path.replace(this.watchHome, '');
        let provider = this.getProvider();

        switch (upload.action) {
          case 'ADD':
          case 'CHANGE':
            let addPromise = provider.upload(upload.path, targetPath);
            this._markAsDoneIfNoError(addPromise, upload);
            break;
            case 'MOVE':
              let fromPath = upload.pathOrigin.replace(this.watchHome, '');
              let movePromise = provider.move(fromPath, targetPath);
              this._markAsDoneIfNoError(movePromise, upload);
              break;
          case 'REMOVE':
            let removePromise = provider.remove(targetPath);
            this._markAsDoneIfNoError(removePromise, upload);
            break;
          default:
            debug('Unknown change type', change);
        }

      } else {
        this.bufferSize --;
      }
    }
  }

  async start() {
    if (!this.getProvider) {
      throw new Error('No storage provider configured');
    }
    this.uploadsFromLastRun = await uploadQueue.getFlaggedAsActive() || [];
    let size = await uploadQueue.getSize();

    if (this.uploadsFromLastRun && this.uploadsFromLastRun.length || size) {
      this._running = true;
      this._check_running();
    }
    this.started = true;
  }

  _check_running() {
    if (this._running) {
      let that = this;
      process.nextTick(function() {
        setTimeout(function() {
          that._run();
          that._check_running();
        }, 500);
      });
    }
  }

  _markAsDoneIfNoError(promise, change) {
    promise
      .then(then => {
        debug('Change %s %s done', change.action, change.path);
        uploadQueue.flagAsDone(change);
        this.bufferSize--;
      })
      .catch(err => {
        debug(err, err.stack);
        if (isNetworkError(err)) {
          uploadQueue.flagAsRedo(change);
        } else {
          uploadQueue.flagAsDone(change);
        }
        this.bufferSize--;
      });
  }
}
