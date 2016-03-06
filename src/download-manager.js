export default class DownloadManager {

  constructor(options = {}) {

    this.queue = new ChangeQueue({
      tablename: 'DOWNLOAD_QUEUE'
    });

    this.providers = options.providers || [];
  }

  start() {

  }

  stop() {

  }

}
