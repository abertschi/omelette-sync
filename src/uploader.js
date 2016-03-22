export default class Uploader {

  function doUpload(provider, file, reject) {
    log.info('Uploading %s %s', file.action, file.path);

    let promise;

    switch (file.action) {
      case 'ADD':
      case 'CHANGE':
        promise = doAddOrChange(provider, file, reject);
        break;
      case 'MOVE':
        promise = doMove(provider, file, reject);
        break;
      case 'REMOVE':
        promise = doRemove(provider, file, reject);
        break;
      default:
        Promise.reject('Upload impossible. Unknown change type ' + file.action);
    }
    return promise;
  }

  function removeLocalPrefix(location) {
    return location.replace(this.watchHome, '/');
  }

  function uploadAddOrChange(provider, file, reject) {
    let promise;
    let targetPath = removeLocalPrefix(file.path);

    if (file.isDir) {
      log.info('[Upload] Creating folder %s', targetPath);

      promise = provider.createFolder(targetPath);
    } else {
      log.info('[Upload] Uploading file %s', targetPath);

      let upstream = this._createReadStream(file.path, error);
      promise = provider.upload(upstream, targetPath);
    }
    //TODO: what if 2 folder created in one request? not handled so far
    promise = Bacon
      .fromPromise(promise)
      .flatMap(done => Bacon.fromPromise(provider.postUpload(file, done)).flatMap(() => done))
      .toPromise();

    return promise;
  }

  function uploadMove(provider, file, reject) {
    let targetPath = removeLocalPrefix(file.path);
    let fromPath = removeLocalPrefix(file.pathOrigin);

    log.info('[Upload] Moving %s to %s', fromPath, targetPath);

    return Bacon
      .fromPromise(provider.move(fromPath, targetPath))
      .flatMap(done => Bacon.fromPromise(provider.postMove(file, done)).flatMap(() => done))
      .toPromise();
  }

  function uploadRemove(provider, file, reject) {
    let targetPath = removeLocalPrefix(file.path);

    log.info('[Upload] Removing %s', targetPath);

    return Bacon
      .fromPromise(provider.remove(targetPath))
      .flatMap(done => Bacon.fromPromise(provider.postRemove(file, done)).flatMap(() => done))
      .toPromise();
  }

  _createReadStream(location, error) {
    let stream = fs.createReadStream(location);
    stream.on('error', error);

    if (this.useEncryption) {
      return this.encryption.encryptStream(stream, error)
        .on('error', error);
    } else {
      return stream;
    }
  }

}
