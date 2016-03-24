import Bacon from 'baconjs';
import CloudIndex from '../../index/cloud-index.js';
import mergeObjects from '../../util/merge-objects.js';

let cloudIndex = new CloudIndex();

let log = require('../../debug.js')('gdrive');

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export default function detectChange(file, providerId) {

  return cloudIndex.get(providerId, file.id)
    .flatMap(index => {
      let deleted = file.action == 'REMOVE';

      if (index && deleted) return prepareRemoveType(providerId, file, index);
      else {
        if (!index && !deleted) return prepareAddType(providerId, file);
        else if (index) {
          if (index.parentId != file.parentId) return prepareMoveType(providerId, file, index);
          else if (index.name != file.name) return prepareRenameType(providerId, file, index);
          else if (!_isDir(file.mimeType) && file.md5Checksum != index.md5Checksum) return prepareChangeType(providerId, file);
          else isNotRelevant(file, index);
        } else isNotRelevant(file, index);
      }
    }).filter(set => set);
}

function isNotRelevant(file, index) {
  log.debug('Ignoring change %s', file.id, file.path, file, index);
}

function prepareAddType(providerId, file) {
  file.action = 'ADD';
  return file;
}

function prepareRemoveType(providerId, file, index) {
  file.action = 'REMOVE';
  file.parentId = index ? index.parentId : null;
  return file;
}

function prepareMoveType(providerId, file, index) {
  file.action = 'MOVE';
  file.index = index;

  return file;
}

function prepareRenameType(providerId, file, index) {
  return prepareMoveType(providerId, file, index);
}

function prepareChangeType(providerId, file) {
  file.action = 'CHANGE';
  return file;
}

function _isDir(mime) {
  return mime ? mime == FOLDER_MIME_TYPE : null;
}
