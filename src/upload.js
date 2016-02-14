import Emitter from './emitter.js';
import FileChangeQueue from './file-change-queue.js';

let debug = require('debug')('bean');

export default class Upload {

  constructor(options) {
    this.auth = options.auth;
    this.running = false;
    this.started = false;

    Emitter.on('update-queue', (payload) => {
      if (!this.running) {
        this.running = true;
        this._loop();
      }
    });
  }

  start () {
    this.started = true;
    this.running = true;

    debug(FileChangeQueue);
    debug(FileChangeQueue.getSize());
    this._loop();
  }

  _loop() {
    while(this.started && this.running && FileChangeQueue.getSize()) {
      //let up = FileChangeQueue.peekChange();
      //FileChangeQueue.completeChange(up.path);
    }
    this.running = false;
  }
}
