import ChangeQueue from './change-queue.js';
import isNetworkError from '../cloud/is-network-error.js';
let log = require('../debug.js')('runner');
import Bacon from 'baconjs';
import Encryption from '../encryption.js';
import fs from 'fs';
import Providers from '../cloud/providers.js';
let util = require('util');

export default class ChangeRunner {

  constructor(options = {}) {
    this.queue = options.queue;

    this.callback = options.callback;
    this.callbackObject = options.callbackObject;

    // hooks
    this.beforeChange = options.beforeChange;
    this.afterChange = options.afterChange;
    this.afterAll = options.afterAll;

    this.concurrencyLimit = options.concurrencyLimit || 1;
    this.checkFrequency = options.checkFrequency || 100;
    this._pendingChanges = [];
    this._running = false;
    this._started = false;
    this._changesActive = 0;

    this._registerQueueEvents();
  }

  async start() {
    this._started = true;
    this._pendingChanges = await this.queue.getFlaggedAsActive() || [];
    let size = await this.queue.getSize();

    if (this._pendingChanges && this._pendingChanges.length || size) {
      this._running = true;
      this._keepalive();
    }
  }

  stop() {
    this._running = true;
    this._started = false;
  }

  async _run() {
    if (this._running && this._changesActive < this.concurrencyLimit) {
      this._changesActive++;
      let change;

      if (this._pendingChanges.length) {
        change = this._pendingChanges.pop();
      } else {
        change = await this.queue.peek();
      }

      if (change) {
        if (this.beforeChange) {
          this.beforeChange.apply(this.callbackObject, [change]);
        }
        let promise = this.callback.apply(this.callbackObject, [change]);
        if (promise) {
          this._markAsDoneIfNoError(promise, change);
        } else {
          if (this.afterChange) {
            this.afterChange.apply(this.callbackObject, [change]);
          }
          this._changesActive--;
        }
      } else {
        this._changesActive--;
      }
    }
  }

  _markAsDoneIfNoError(promise, change) {
    promise
      .then(then => {
        this.queue.flagAsDone(change);
        this._changesActive--;
      })
      .catch(err => {
        log.error('An Error occurred while processing change', change, err, err ? err.stack: '');
        if (isNetworkError(err)) {
          this.queue.flagAsRedo(change);
        } else {
          this.queue.flagAsDone(change);
        }
        this._changesActive--;
      }).then(() => {
        if (this.afterChange) {
          this.afterChange.apply(this.callbackObject, [change]);
        }
      });
  }

  _registerQueueEvents() {
    this.queue.on('empty', () => {
      this._running = false;
      log.debug('All changes done. Stop checking until new events');
      if (this.afterAll) {
        this.afterAll.apply(this.callbackObject, []);
      }
    });

    this.queue.on('not-empty', () => {
      if (!this._running) {
        this._running = true;
        this._keepalive();
      }
    });
  }

  _keepalive() {
    if (this._running) {
      let that = this;
      process.nextTick(function() {
        setTimeout(function() {
          that._run();
          that._keepalive();
        }, that.checkFrequency);
      });
    }
  }
}
