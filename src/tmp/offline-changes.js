import childProcess from 'child_process';
import Bacon from 'baconjs';
import File, { ACTIONS } from './file.js';
let debug = require('debug')('bean');
var path = require('path');

export function getFileChangesSince(directory, timestampInMsec = 0) {

  if (!timestampInMsec) {
    debug('changesSince with since=0 called');
    return new Bacon.Never();
  }

  let script = __dirname + '/find-changes-since.sh';
  let ctime = new Date().getTime() - timestampInMsec;
  ctime = Math.round(ctime / 1000 * -1);

  const find = childProcess.spawn('sh', ['./file-changes-since.sh']);
  return processSpawn(find);
}

export function getAllFiles(directory) {
    let script = __dirname + '/watcher/find-all-changes2.sh';
    const find = childProcess.spawn('sh', [script, directory]);

    return processSpawn(find);
    // return new Bacon.once(new File());
}

function processSpawn(cmd) {

  let results = Bacon
    .fromEvent(cmd.stdout, 'data')
    .map(raw => String(raw))
    .flatMap(founds => Bacon.fromArray(founds.split('\n')))
    .map(output => {
      const SEP_INDEX = output.indexOf(' ') + 1;
      let id = output.substring(0, SEP_INDEX);
      let path = output.substring(SEP_INDEX)
      let isDir = (path[path.length -1] === '/');

      return new File({path: path, action: ACTIONS.UNKNOWN, id: id})});

  let errors = Bacon
    .fromEvent(cmd.stderr, 'data')
    .map(raw => new Bacon.Error(String(raw)));

  let done = Bacon
    .fromEvent(cmd.stdout, 'close')
    .map(code => new Bacon.Never()); //todo

  return results;
}
