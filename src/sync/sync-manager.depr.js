import UploadManager from './upload-manager.js';
import DownloadManager from './download-manager.js'

export default class SyncManager {

  constructor(options) {
    this.watchHome = options.watchHome;
    let providers = options.providers || [];

    this.downloadManager = new DownloadManager({
      providers: providers,
      watchHome: this.watchHome
    });

    this.uploadManager = new UploadManager({
      providers: providers,
      watchHome: this.watchHome
    });

    this.changes = new Map();

    if (!this.watchHome) {
      throw new Error('No Watch Home defined');
    }
  }

  start() {
    this.uploadManager.start();
    this.downloadManager.start();
  }

  stop() {
    this.uploadManager.stop();
    this.downloadManager.stop();
  }

  queueUpload(change) {
    // remember change so wont be downloaded after upload
    this.changes.set(change.path, '');
    this.uploadManager.push(change);
  }
}
