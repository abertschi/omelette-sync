import childProcess from 'child_process';
import Bacon from 'baconjs';

var path = require('path');

let debug = require('debug')('offline-watcher');

export function getEverytingInDirectory() {
  const SCRIPT = __dirname + '/find-all-changes.sh';
  let find = childProcess.spawn('sh', [SCRIPT, this.directory]);
  return this._processOutput(find);
}

export function getChangesSince(date) {
  const SCRIPT = __dirname + '/find-changes-since.sh';
  const CTIMESECS = Math.round((new Date().getTime() - date.getTime()) / 1000);
  const CTIME = '-' + CTIMESECS + 's';
  let find = childProcess.spawn('sh', [SCRIPT, this.directory, CTIME]);
  return this._processOutput(find);
}

_processOutput(cmd, type) {
  let results = Bacon
    .fromEvent(cmd.stdout, 'data')
    .map(raw => String(raw))
    .flatMap(founds => Bacon.fromArray(founds.split('\n')))
    .map(output => {
      const SEP_INDEX = output.indexOf(' ') + 1;
      let id = output.substring(0, SEP_INDEX);
      let path = output.substring(SEP_INDEX)
      let isDir = (path[path.length -1] === '/');

      return {
        path: path,
        id: id,
        isDir: isDir
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
