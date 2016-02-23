import childProcess from 'child_process';
import Bacon from 'baconjs';
var path = require('path');

let debug = require('debug')('bean:watcher');

export function listRecursive(directory) {
  const SCRIPT = __dirname + '/list-directory-recursive.sh';
  let find = childProcess.spawn('sh', [SCRIPT, directory]);
  return processOutput(find);
}

export function list(directory) {
  const SCRIPT = __dirname + '/list-directory.sh';
  let find = childProcess.spawn('sh', [SCRIPT, directory]);
  return processOutput(find);
}

export function listChanges(directory, date) {
  const SCRIPT = __dirname + '/list-changes.sh';
  const CTIMESECS = Math.round((new Date().getTime() - date.getTime()) / 1000);
  let find = childProcess.spawn('sh', [SCRIPT, directory, CTIMESECS]);
  return processOutput(find);
}

function processOutput(cmd) {
  let results = Bacon
    .fromEvent(cmd.stdout, 'data')
    .map(raw => String(raw))
    .flatMap(founds => Bacon.fromArray(founds.split('\n')))
    .filter(f => f.trim() != '')
    .map(output => {
      let isDir = (output[0] == 'd');
      const ID_END = output.indexOf(' ', 2);
      let id = output.substring(2, ID_END);
      let path = output.substring(ID_END + 1)

      let file = {
        path: path,
        id: id,
        isDir: isDir
      };

      return file;
    });

  let bus = new Bacon.Bus();

  let end = Bacon
    .fromEvent(cmd.stdout, 'close')
    .doAction(code => {
      debug('Ending script');
      bus.end()
    });

  let errors = Bacon
    .fromEvent(cmd.stderr, 'data')
    .map(raw => String(raw))
    .flatMap(founds => Bacon.fromArray(founds.split('\n')))
    .filter(f => f.trim() != '');


  results.merge(errors).merge(end)
    .onValue(v => {
      bus.push(v)
    });

  return bus;
}
