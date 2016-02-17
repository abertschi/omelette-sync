import childProcess from 'child_process';
import Bacon from 'baconjs';
import File, { ACTIONS } from './file.js';
let debug = require('debug')('bean');
var path = require('path');

export default class ShellScanner {

  constructor(directory) {
    this.directory = directory;
    this.watchSpawn = null;
  }

  watch() {
    const SCRIPT = __dirname + '/watch-directory.sh';
    this.watchSpawn = childProcess.spawn('sh', [SCRIPT, this.directory]);
    return this._processOutput(this.watchSpawn);
  }

  stopWatch() {
    if (this.watchSpawn) {
      this.watchSpawn.stdin.pause();
      this.watchSpawn.kill();
    }
  }

  _processOutput(cmd) {

  let results = Bacon
    .fromEvent(cmd.stdout, 'data')
    .map(raw => String(raw))
    .flatMap(founds => Bacon.fromArray(founds.split('\n')))
    .map(output => {

      return {

      };

    });

  let errors = Bacon
    .fromEvent(cmd.stderr, 'data')
    .map(raw => new Bacon.Error(String(raw)));

  let done = Bacon
    .fromEvent(cmd.stdout, 'close')
    .map(code => new Bacon.Never()); //todo

  return results.merge(errors).merge(done);
}
