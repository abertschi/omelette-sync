import mkdirp from 'mkdirp';
import trash from 'trash';
import fs from 'fs';

export default class FileWorker {

  constructor(options = {}) {
  }

  move(fromPath, toPath) {
    return new Promise((resolve, reject) => {
      fs.exists(toPath, (exists) => {
        if (!exists) {
          fs.rename(fromPath, toPath, (err) => {
            if (err) reject(err);
            else resolve();
          });
        } else {
          reject(new Error(`File ${toPath} already existing. Can not be moved from ${fromPath}`));
        }
      });
    });
  }

  remove(path) {
    log.info('Removing %s', path);
    return Promise.resolve();
    //eturn trash([path]);
  }

  createDirectory(path) {
    return new Promise((resolve, reject) => {
      mkdirp(path, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
