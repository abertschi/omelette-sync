import ChangeQueue from './change-queue.js';
import isNetworkError from './cloud/is-network-error.js';
let debug = require('debug')('bean:app');
import Bacon from 'baconjs';
import Encryption from './encryption.js';
import fs from 'fs';
import Providers from './cloud/providers.js';

const ENCRYPTED_ENDING = '.enc';

export default class UploadManager {

  constructor(options = {}) {
    this.queue = new ChangeQueue({
      tablename: 'UPLOAD_QUEUE'
    });

    this.providers = options.providers || [];
    this.strategy = options.strategy || 'first-full'; // 'distribute'
    this.watchHome = options.watchHome;
    this.uploadsAtOnce = options.uploadsAtOnce || 1;
    this._running = false;
    this.started = false;
    this.bufferSize = 0;
    this.providerDelegate = new Providers(this.providers);

    this.enableEncryption = options.enableEncryption || false;
    this.encryptFileNames = options.encryptFileNames || false; // TODO impl.
    this.encryptionPassword = options.encryptionPassword;

    if (this.enableEncryption && !encryptionPassword) {
      throw new Error('No password set for encryption');
    } else if (!this.queue) {
      throw new Error('No upload queue set');
    }

    this.encryption = new Encryption({
      password: this.encryptionPassword
    });

    if (!this.watchHome) {
      throw new Error('No watch home dir');
    }

    this.queue.on('empty', () => {
      this._running = false;
    });

    this.queue.on('not-empty', () => {
      if (!this._running) {
        this._running = true;
        this._keepalive();
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

  push(change) {
    this.queue.push(change);
  }

  _createStream(location) {
    let stream = fs.createReadStream(location);
    if (this.enableEncryption) {
      return this.encryption.encryptStream(stream);
    } else {
      return stream;
    }
  }

  async _run() {
    if (this._running && this.bufferSize < this.uploadsAtOnce) {
      this.bufferSize++;

      let upload;
      if (this.uploadsFromLastRun.length) {
        upload = this.uploadsFromLastRun.pop();
      } else {
        upload = await this.queue.peek();
      }

      if (upload) {
        let targetPath = upload.path.replace(this.watchHome, '');
        let provider = this.getProvider();

        switch (upload.action) {
          case 'ADD':
          case 'CHANGE':
            let addPromise;
            if (upload.isDir) {
              addPromise = provider.createFolder(targetPath);
            } else {
              let upstream = this._createStream(upload.path);
              addPromise = provider.upload(upstream, targetPath);
            }
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
        this.bufferSize--;
      }
    }
  }

  async start() {
    this.uploadsFromLastRun = await this.queue.getFlaggedAsActive() || [];
    let size = await this.queue.getSize();

    if (this.uploadsFromLastRun && this.uploadsFromLastRun.length || size) {
      this._running = true;
      this._keepalive();
    }
    this.started = true;
  }

  stop() {
    this._running = true;
    this.started = false;
  }

  _keepalive() {
    if (this._running) {
      let that = this;
      process.nextTick(function() {
        setTimeout(function() {
          that._run();
          that._keepalive();
        }, 500);
      });
    }
  }

  _markAsDoneIfNoError(promise, change) {
    promise
      .then(then => {
        debug('Change %s %s done', change.action, change.path);
        this.queue.flagAsDone(change);
        this.bufferSize--;
      })
      .catch(err => {
        debug(err, err.stack);
        if (isNetworkError(err)) {
          this.queue.flagAsRedo(change);
        } else {
          this.queue.flagAsDone(change);
        }
        this.bufferSize--;
      });
  }
}
