import childProcess from 'child_process';
import Bacon from 'baconjs';
import chokidar from 'chokidar';
import File, { ACTIONS } from './file.js';

export default function watchDirectory(directory) {

  let watcher = chokidar.watch(directory);
  let isReady = Bacon.fromEvent(watcher, 'ready')
    .map(() => true)
    .toProperty(false);

  const relevantEvents = ['addDir', 'change', 'add', 'unlink', 'unlinkDir'];

  return Bacon.fromBinder(sink => {
      watcher.on('all', (event, path) => {
        sink( new File({
          action: getAction(event),
          path: path
        }));
      });
    })
    .filter(isReady)
    .filter(file => relevantEvents.indexOf(file.action) != -1);
}

function getAction(event) {
  let action = ACTIONS.UNKNOWN;

  switch(event) {
    case 'addDir': action = ACTIONS.ADD_DIR;
      break;
    case 'add': action = ACTIONS.ADD;
      break;
    case 'unlink': action = ACTIONS.UNLINK;
      break;
    case 'unlinkDir': action = ACTIONS.UNLINK_DIR;
      break;
    case 'change': action =ACTIONS.CHANGE;
      break;
    default:
  }
  return action;
}
