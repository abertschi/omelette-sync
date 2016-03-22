class StorageProvider {

  accountId() {}

  providerName() {}

  providerImpl() {}

  upload(stream, location) {}

  postUpload(file, response) {}

  download (stream, location){}

  postDownload(file, response) {}

  move(sourceLocation, targetLocation) {}

  postMove(file, response) {}

  remove(location) {}

  postRemove(file, response) {}

  createFolder(location) {}

  postCreateFolder(file, response) {}

};

export default StorageProvider;
