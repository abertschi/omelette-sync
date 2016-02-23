import Bacon from 'baconjs';
import fs from 'fs';

export default function existsOnDisk(path) {
  return Bacon.fromBinder(sink => {
    try {
      fs.accessSync(path, fs.F_OK);
      sink(true);
    } catch (e) {
      sink(false);
    }
  });
}
