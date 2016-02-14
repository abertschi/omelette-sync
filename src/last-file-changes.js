import childProcess from 'child_process';
import Q from 'Q';
import Bacon from 'baconjs';

let debug = require('debug')('bean');

export function latestChanges(directory, timeFrom = 0) {

  if (!timeFrom)
    return allFiles(directory);

  timeFrom = new Date().getTime() - timeFrom;

  let result = Q.defer();
  let changes = [];

  const find = childProcess.spawn('find', [directory, '-ctime', lastrun + 's']);

  Bacon.fromEvent(find.stdout, 'data')
    .map(raw => String(data))
    .flatMap(array => array.split('\n'))
    .flatMap(Bacon.fromArray)
    .onValue(v => console.log(v));


  find.stdout.on('data', (data) => {
    let files = String(data).split('\n');
    if (files.length > 1) {
      changes = changes.concat(files);
    } else {
      changes.push(files);
    }
  });

  find.stderr.on('data', (data) => {});

  find.on('close', (code) => {
    debug(`detection for latest file changes ended with code ${code}`);
    result.resolve(changes);
  });

  return result.promise;
}

export function allFiles()
