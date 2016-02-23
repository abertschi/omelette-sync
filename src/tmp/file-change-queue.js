import Emitter from './emitter.js';
import Storage from './storage.js';

let debug = require('debug')('bean-queue');
let queue = new Map(Storage.getItem('change-queue'));

class FileChangeQueue {

  constructor() {
    this._storageTimeout = {};

    process.on('SIGINT', function() {
      Storage.setItem('change-queue', queue);
    });
  }

  _emitUpdate() {
    Emitter.emit('update-queue');
  }

  getSize() {
    return queue.size;
  }

  peekChange() {
    if (this.getSize() > 0) {
      let change = queue.get(queue.keys().next().value);
      change.processing = true;
      queue.set(change.path, change);

      debug('peeking change[' + change.action + ']: ' + change.path);
      return change;
    }
    return {};
  }

  completeChange(path) {
    if (queue.get(path) && queue.get(path).processing) {
      queue.delete(path);
      debug('change is done: ' + path);
    }
  }

  pushChange(action, path) {
    let change = {
      action: action,
      path: path,
      timestamp: new Date().getTime(),
      processing: false
    }

    debug('pushing change[' + change.action + ']: ' + change.path);

    if (queue.get(path) && queue.get(path).processing) {
       //Emitter.emit('') stop processing because new change
     }
    queue.set(path, change);
    this._emitUpdate();
  }
}


export default new FileChangeQueue();
