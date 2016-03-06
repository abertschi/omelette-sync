import Bacon from 'baconjs';
export default class Providers {

  constructor(providers) {
    this.providers = providers || [];
  }

  upload(source, location, properties = {}) {
    throw new Error('Not supported operation');
  }

  createFolder(location, properties = {}) {
    return this._execute(this.providers, 'createFolder', [location, properties]);
  }

  download(location, properties = {}) {
    return this._execute(this.providers, 'createFolder', [location, properties]);
  }

  exists(location, properties = {}) {
    return this._execute(this.providers, 'exists', [location, properties]);
  }

  list(location, level = null, properties = {}) {
    return this._execute(this.providers, 'exists', [location, level, properties]);
  }

  remove(location, properties = {}) {
    return this._execute(this.providers, 'remove', [location, level, properties]);
  }

  move(locationFrom, locationTo, properties = {}) {
    return this._execute(this.providers, 'move', [locationFrom, locationTo, properties]);
  }

  getRootDir() {
    return this._execute(this.providers, 'getRootDir', null);
  }

  getStorage(properties = {}) {
    return this._execute(this.providers, 'getStorage', properties);
  }

  _execute(array, functionName, options = {}) {
    return Bacon.fromArray(array)
      .flatMap(p => {
        return Bacon.fromPromise(p[functionName].apply(p, options)).toPromise(); // TODO: then() not available after
      })
      .fold([], (array, element) => {
        console.log(element);
        array.push(element);
        return array;
      });
  }
}
