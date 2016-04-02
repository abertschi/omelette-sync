export default class Change {

  constructor(obj) {

    this.action = null;
    this.homeDir = null;
    this.isDir = null;
    this.path = null;
    this.pathOrigin = null;
    this.timestamp = null;

    // for unmarshalling from json
    for (var prop in obj) this[prop] = obj[prop];

  }

}
