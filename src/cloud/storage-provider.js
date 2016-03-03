class Provider {

  upload(source, location, properties = {}) {
    return {
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

  remove(location, properties = {}) {
    return {
      properties: {}
    };
  }

  move(locationFrom, locationTo, properties = {}) {
    return {
      properties: {}
    };
  }

  getRootDir() {

  }

  getStorage(properties = {}) {
    return {
      total: null,
      used: null,
      properties: {}
    };
  }
};

export default Provider;
