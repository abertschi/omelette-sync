import Bacon from 'baconjs';
import CloudIndex from '../../index/cloud-index.js';
import mergeObjects from '../../util/merge-objects.js';

let cloudIndex = new CloudIndex();

let log = require('../../debug.js')('gdrive');

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export default function detectChange(file, providerId) {
  return cloudIndex.get(providerId, file.id)
    .doAction(index => log.trace('Determing change type. CHANGE: %s \nINDEX: %s', file, index))
    .flatMap(index => {

      if (file.action == 'REMOVE') return prepareRemoveType(providerId, file, index);
      else {
        if (!index) return prepareAddType(providerId, file);
        else if (index.parentId != file.parentId) return prepareMoveType(providerId, file);
        else if (index.name != file.name) return prepareRenameType(providerId, file);
        else if (!_isDir(file.mimeType) && file.md5Checksum != index.md5Checksum) return prepareChangeType(providerId, file);
        else {
          log.debug('Ignoring change %s', file.id, file.name);
          /*
           * This change is not relevant because:
           * - it was uploaded by this client or
           * - the parent directory of this change is listed as a change.
           */
        }
      }
    }).filter(set => set);
}

function prepareAddType(providerId, file) {
  return _getFileNodes(providerId, file.parentId)
    .flatMap(parentNodes => {
      file.action = 'ADD';
      parentNodes.push(file.name);
      file.path = _nodesToPath(parentNodes);
      return file;
    });
}

function prepareRemoveType(providerId, file, index) {
  return _getFileNodes(providerId, file.id)
    .flatMap(nodes => {
      let pathOrigin = _nodesToPath(nodes);
      file.action = 'REMOVE';
      file.path = pathOrigin;
      file.parentId = index ? index.parentId : null;
      log.info('Remove with composed path: %s', pathOrigin);
      return file;
    });
}

function prepareMoveType(providerId, file) {
  return _getFileNodes(providerId, file.id)
    .flatMap(nodes => {
      return _getFileNodes(providerId, file.parentId)
        .flatMap(parentNodes => {
          file.action = 'MOVE';
          file.pathOrigin = _nodesToPath(nodes);
          parentNodes.push(file.name);
          file.path = _nodesToPath(parentNodes);
          return file;
        });
    });
}

function prepareRenameType(providerId, file) {
  return _getFileNodes(providerId, file.id)
    .flatMap(nodes => {
      file.action = 'MOVE';
      file.pathOrigin = _nodesToPath(nodes);
      file.path = _nodesToPath(nodes.slice(0, nodes.length - 1)) + file.name;
      return file;
    });
}

function prepareChangeType(providerId, file) {
  return _getFileNodes(providerId, file.id)
    .flatMap(nodes => {
      file.action = 'CHANGE';
      file.path = _nodesToPath(nodes);
      return file;
    });
}

function _isDir(mime) {
  return mime ? mime == FOLDER_MIME_TYPE : null;
}

function _getFileNodes(providerId, fileId) {
  let walkToRoot = (fileId, parents = []) => {
    return cloudIndex.get(providerId, fileId)
      .flatMap(index => {
        if (index && index.name) {
          log.trace('Add %s to path', index.name);
          parents.push(index.name);
          return walkToRoot(index.parentId, parents);
        } else {

          parents.pop();
          parents.reverse();
          log.trace('Composed index: %s', parents);
          return parents;
        }
      });
  }
  return walkToRoot(fileId);
}

function _nodesToPath(nodes = []) {
  let path = '';
  nodes.forEach(d => {
    path += '/' + d;
  });
  if (path == '') {
    path = '/';
  }
  return path;
}
