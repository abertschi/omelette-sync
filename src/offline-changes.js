import childProcess from 'child_process';
import Bacon from 'baconjs';
import File, { ACTIONS } from './file.js';
let debug = require('debug')('bean');

export function changesSince(directory, timestampInMsec = 0) {

  if (!timestampInMsec) {
    debug('changesSince with since=0 called');
    return new Bacon.End();
  }

  let deltaTime = new Date().getTime() - timestampInMsec;
  deltaTime = Math.round(deltaTime / 1000 * -1); // in seconds, negative for find argument

  debug(`find ${directory} -ctime ${deltaTime}s`);
  const find = childProcess.spawn('find', [directory, '-ctime', deltaTime + 's']);
  return _processSpawn(find);
}

export function allFiles(directory) {
    debug(`find ${directory}`);
    return _processSpawn(childProcess.spawn('find', [directory]));
}

function _processSpawn(cmd) {

  let results = Bacon
    .fromEvent(cmd.stdout, 'data')
    .map(raw => String(raw))
    .flatMap(founds => Bacon.fromArray(founds.split('\n')))
    .filter(value => value.trim())
    .map(path => { return new File({path: path, action: ACTIONS.UNKNOWN})})

  let errors = Bacon
    .fromEvent(cmd.stderr, 'data')
    .map(raw => new Bacon.Error(String(raw)));

  let done = Bacon
    .fromEvent(cmd.stdout, 'close')
    .map(code => new Bacon.End()); //todo

  return results;
}
