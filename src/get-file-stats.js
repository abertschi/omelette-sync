import Bacon from 'baconjs';
import fs from 'fs';

export default function getFileStats(path) {
  
  return Bacon.fromNodeCallback(fs.stat, path)
    .map(stats => {
      return {
        id: stats.ino,
        isDir: stats.isDirectory()
      };
    });
}
