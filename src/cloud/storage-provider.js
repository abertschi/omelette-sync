class Provider {

  upload(source, location) {
    return {
      properties: {}
    };
  }

  listChanges(since) {
    return {
      changes: [{
        action: 'REMOVE',
        path: '/relative/to/syncroot',
        properties: {}
      }],
      properties: {}
    };
  }

  createFolder(location, properties = {}) {
    return {
      properties: {}
    };
  }

  download(location, properties = {}) {
    return {
      stream: null,
      properties: {}
    }
  }

  exists(location, properties = {}) {
    return {
      exists: false,
      properties: {}
    };
  }

  list(location, level = null, properties = {}) {
    return {
      files: [{
        path: null
      }],
      properties: {}
    };
  }

  remove(location) {
    return {
      properties: {}
    };
  }

  move(locationFrom, locationTo) {
    return {
      properties: {}
    };
  }

  getRootDir() {
    return '/path/to/omelette-sync-root/';
  }

  getStorage() {
    return {
      total: null,
      used: null,
      properties: {}
    };
  }
};

export default Provider;
