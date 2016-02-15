import childProcess from 'child_process';
import Bacon from 'baconjs';
import chokidar from 'chokidar';

export default function watchDirectory(directory) {

  let watcher = chokidar.watch(directory);
  let isReady = Bacon.fromEvent(watcher, 'ready')
    .map(() => true)
    .toProperty(false);

  const relevantEvents = ['addDir', 'change', 'add', 'unlink', 'unlinkDir'];

  return Bacon.fromBinder(sink => {
      watcher.on('all', (event, path) => {
        sink({
          action: event,
          path: path
        });
      });
    })
    .filter(isReady)
    .filter(file => relevantEvents.indexOf(file.action) != -1);
}
