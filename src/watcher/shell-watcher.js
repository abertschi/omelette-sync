import childProcess from 'child_process';
import Bacon from 'baconjs';
let debug = require('debug')('bean:watcher:shell');
var path = require('path');

export default class ShellScanner {

  constructor(options) {
    this.directory = options.directory;
    this.watchSpawn = null;
    this.interval = options.interval | 1;
    this.lookback = options.lookback | 120;
  }

  watch() {
    const SCRIPT = __dirname + '/watch-directory.sh';
    debug('Start watching of %s [%s, %s]', this.directory, this.interval, this.lookback);

    this.watchSpawn = childProcess.spawn('sh', [SCRIPT, this.directory, this.interval, this.lookback]);
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
      .filter(f => f.trim() != '')
      .map(output => {

        const ID_END = output.indexOf(' ');
        let id = output.substring(0, ID_END);

        let isDir = (output.substring(ID_END + 1, ID_END + 2) == 'd');

        const PATH_STRT = id.length + 3;
        let path = output.substring(PATH_STRT);

        debug(path, id, isDir);
        return {
          id: id,
          isDir: isDir,
          path: path
        };

      });

      let bus = new Bacon.Bus();

      let end = Bacon
        .fromEvent(cmd.stdout, 'close')
        .doAction(code => {
          debug('Stream ended');
          bus.end()
        });

        let errors = Bacon
          .fromEvent(cmd.stderr, 'data')
          .map(raw => String(raw))
          .flatMap(founds => Bacon.fromArray(founds.split('\n')))
          .filter(f => f.trim() != '')
          .doAction(f => debug('error: ', f));


      results.concat(end).merge(errors)
        .onValue(v => {
          bus.push(v)
        });

      return bus;
  }
}
