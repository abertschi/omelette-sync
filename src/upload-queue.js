export default class ExportQueue {

  constructor(init = {}) {

    this.current = init.current || null;
    Map.prototype.sort = function sortMap(sortFunc) {
      var results = [];
      this.forEach((value, key, map) => {
        results.push(value);
      });
      return results.sort(sortFunc);
    }
    this.queue = init.queue ? new Map(init.queue) : new Map();
  }

  generateKey(upload) {
    let key = {
      action: upload.action,
      path: upload.path
    }
    return JSON.stringify(key);
  }

  push(change) {
    let changeKey = this.generateKey(change);
    if (!this.queue.has(changeKey)) {
      if (change.action == 'MOVE') {
        let keyOrigin = this.generateKey({
          action: 'MOVE',
          path: change.pathOrigin
        });

        if (this.queue.has(keyOrigin)) {
          this.queue.delete(keyOrigin);
        }
      } else if (change.action == 'REMOVE') {
        let toDelete = [];
        this.queue.forEach((value, key, map) => {
          if (value.path.indexOf(change.path) > -1) {
            toDelete.push(key);
          }
        });
        toDelete.forEach(key => {
          this.queue.delete(key);
        });
      }
      this.queue.set(changeKey, change);
    }
  }

  getSize() {
    return this.queue.size;
  }

  get() {
    if (this.queue.size) {
      let changes = this.queue.sort((a, b) => a.timestamp < b.timestamp ? -1 : 1);
      this.current = changes[0];
      let key = this.generateKey(this.current);
      this.queue.delete(key);
      return this.current;
    } else {
      return null;
    }
  }
}
