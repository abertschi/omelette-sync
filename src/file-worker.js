import mkdirp from 'mkdirp';
import trash from 'trash';
import fs from 'fs';
let log = require('./debug.js')('fileworker');
import getFileStats from './util/get-file-stats.js';
import Bacon from 'baconjs';

export default class FileWorker {

  constructor(options = {}) {
    this.downloadSuffix = options.downloadSuffix || '.syncdownload';
  }



  move(fromPath, toPath, overwrite=false) {
    return new Promise((resolve, reject) => {
      fs.exists(toPath, (exists) => {
        if (!exists || overwrite == true) {
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
    //return Promise.resolve();
    return trash([path]);
  }

  createDirectory(path) {
    return new Promise((resolve, reject) => {
      this.exists(path)
        .then((exists) => {
          if (exists) resolve();
          else {
            mkdirp(path, function(err) {
              if (err) reject(err);
              else resolve();
            });
          }
        })
        .catch(reject);
    });
  }

  exists(path) {
    return new Promise((resolve, reject) => {
      fs.access(path, fs.F_OK, (err) => {
        log.info(err);
        if (err) resolve(false);
        else resolve(true);
      });
    });
  }

  createReadStream(location, error) {
    let stream = fs.createReadStream(location);
    stream.on('error', error);

    return stream;
  }

  _getDownloadPath(base, i = 0) {
    return new Promise((resolve, reject) => {
      let path = `${base}.${i}${this.downloadSuffix}`;
      return this.exists(path)
        .then(exists => {
          if (exists) {
            i++;
            return this._getDownloadPath(base, i).then(resolve).catch(reject);
          } else {
            log.info('Get download path: %s', path);
            return resolve(path);
          }
        }).catch(reject);
    });
  };

  markDownloadAsDone(downloadPath, timestamp) {
    let suffixIndex = downloadPath.lastIndexOf(this.downloadSuffix);
    let location = downloadPath.substr(0, suffixIndex - 2);

    return Bacon.fromPromise(this.exists(location))
      .flatMap(exist => {
        if (exist) {
          return getFileStats(location)
            .flatMap(fileStats => {
              let mTime = new Date(fileStats.stats.mtime).getTime();
              log.info('disk timestamp: %s', mTime);
              log.info('cloud timestamp: %s', timestamp);

              if (mTime < timestamp) {
                return Bacon.fromPromise(this.remove(location));
              } else {
                // conflict. file on disk is newer than change
                return Bacon.Error('File version conflict. Existing file is newer than downloaded change.');
              }
            });
        }
        return;
      })
      .flatMap(() => this.move(downloadPath, location))
      .toPromise();
  }

  createDownloadStream(location, error) {
    return new Promise((resolve, reject) => {
      this._getDownloadPath(location)
        .then(path => {
          resolve({
            location: path,
            stream: this.createWriteStream(path, error)
          });
        }).catch(reject);
    });
  }

  createWriteStream(location, error) {
    let stream = fs.createWriteStream(location);
    stream.on('error', error);
    return stream;
  }
}
