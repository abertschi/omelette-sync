class Provider {

  upload(source, targetDir, options = {}) {}

  remove(targetDir, options = {}) {}

  move(fromDir, toDir, options = {}) {}

  getRemainingStorage(options = {}) {}
};

export default Provider;
