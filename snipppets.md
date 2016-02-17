# SNIPPETS

.doAction(d=> debug('2: ', d));


  _addFileStats(stream) {
    return stream
      .flatMap(file => { // combine filepath with fileId using _getFileId
        return Bacon.fromBinder(sink => {
          this._getFileStats(file.path)
            .onValue(metadata => {
              file.id = metadata.id;
              file.isDir = metadata.isDir;
              sink(file);
            });
          });
        });

  return stream
    .flatMap(file => {
      return this._getFileStats(file.path)
        .flatMap(stats => {
          debug('1: ', file, stats);
          file.id = stats.id;
          file.isDir = stats.isDir;
          return file;
        });
    })
    .doAction(d=> debug('2: ', d));
