import uploadQueue from './upload-queue.js';
import isNetworkError from './cloud/is-network-error.js';
let debug = require('debug')('bean:app');
import Bacon from 'baconjs';

export default class SyncManager {

  constructor(options = {}) {
    this.providers = options.providers || [];
    this.strategy = options.strategy || 'first-full'; // 'distribute'
    this.watchHome = options.watchHome;
    this.uploadsAtOnce = options.uploadsAtOnce || 3;
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
    if (this._running && this.bufferSize < this.uploadsAtOnce) {
      this.bufferSize++;

      let size = await uploadQueue.getSize();
      if (size) {
        let upload = await uploadQueue.pop();
        if (upload) {
          let target = upload.path.replace(this.watchHome, '');
          let provider = this.getProvider();

          switch (upload.action) {
            case 'ADD':
            case 'CHANGE':
              let promise = provider.upload(upload.path, target);
              this._markAsDoneIfNoError(promise, upload);
              break;
            case 'REMOVE':
              let remove = provider.remove(target);
              this._markAsDoneIfNoError(remove, upload);
              break;
            default:
              debug('Unknown change type', change);
          }
        }
      }
    }
  }

  async start() {
    if (!this.getProvider) {
      throw new Error('No storage provider configured');
    }
    if (await uploadQueue.getSize()) {
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
          this.bufferSize--;
        }
      });
  }
}
