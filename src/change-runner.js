import ChangeQueue from './change-queue.js';
import isNetworkError from './cloud/is-network-error.js';
let debug = require('debug')('bean:app');
import Bacon from 'baconjs';
import Encryption from './encryption.js';
import fs from 'fs';
import Providers from './cloud/providers.js';
let util = require('util');

const KEEP_ALIVE_FREQUENCY = 1000;

export default class ChangeRunner {

  constructor(options = {}) {
    this.queue = options.queue;
    this.callback = options.callback;
    this.callbackObject = options.callbackObject;
    this.concurrencyLimit = options.concurrencyLimit || 1;
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
    debug('next iteration');
    if (this._running && this._changesActive < this.concurrencyLimit) {
      this._changesActive++;
      let change;

      if (this._pendingChanges.length) {
        change = this._pendingChanges.pop();
      } else {
        change = await this.queue.peek();
      }

      debug('got change: ', change);

      if (change) {
        let promise = this.callback.apply(this.callbackObject, [change]);
        if (promise) {
          this._markAsDoneIfNoError(promise, change);
        } else {
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
        debug(JSON.stringify(then));

        this.queue.flagAsDone(change);
        this._changesActive--;
      })
      .catch(err => {
        debug(err, err.stack);
        if (isNetworkError(err)) {
          this.queue.flagAsRedo(change);
        } else {
          this.queue.flagAsDone(change);
        }
        this._changesActive--;
      });
  }

  _registerQueueEvents() {
    this.queue.on('empty', () => {
      this._running = false;
      debug('All changes done. Stop checking until new events');
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
        }, KEEP_ALIVE_FREQUENCY);
      });
    }
  }
}