import Bacon from 'baconjs';
import clientIndex from './client-index.js';
let log = require('../debug.js')('index');

export default function addToIndex(file) {
  switch (file.action) {
    case 'ADD':
    case 'MOVE':
      log.debug('Add or updating index for %s', file.path);
      return clientIndex.addOrUpdate(file.id, file.path, file.payload);
      break;

    case 'REMOVE':
      log.debug('Removing everhting within %s', file.path);
      return clientIndex.removeByPath(file.path);
      break;

    case 'CHANGE':
    default:
      return Bacon.once();
  }
}
