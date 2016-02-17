import childProcess from 'child_process';
import Bacon from 'baconjs';
import File, { ACTIONS } from './file.js';
let debug = require('debug')('bean');
var path = require('path');

export default class FsWatchWatcher {

  constructor(directory) {
    this.directory = directory;
    this.watchSpawn = null;
  }

  watch() {

    // fswatch /Users/abertschi/ -x --event-flag-separator "#"

    // detect if file was removed by checked if file was moved to .Trash folder

    let dir = '/';
    const ARGS = [dir, '-x', '--event-flag-separator "#"'];

    this.watchSpawn = childProcess.spawn('fswatch', [ARGS]);
    return this._processOutput(this.watchSpawn);
  }

  stopWatch() {
    if (this.watchSpawn) {
      this.watchSpawn.stdin.pause();
      this.watchSpawn.kill();
    }
  }

  _processOutput(cmd) {

  const ACTIONS = ['Created', 'Updated', 'Renamed']

  let results = Bacon
    .fromEvent(cmd.stdout, 'data')
    .flatMap(founds => Bacon.fromArray(founds.split('\n')))
    .map(raw => String(raw))
    .map(output => {
      const PATH_SEPARATOR = output.lastIndexOf(' ');
      let path = output.substring(0, PATH_SEPARATOR);
      let flags = output.substring(PATH_SEPARATOR).split('#');

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
