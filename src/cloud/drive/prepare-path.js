import Bacon from 'baconjs';
import CloudIndex from '../../index/cloud-index.js';
import mergeObjects from '../../util/merge-objects.js';

let cloudIndex = new CloudIndex();

let log = require('../../debug.js')('gdrive');

export default function preparePath(file, providerId) {

  return Bacon.once()
    .flatMap(() => {

      if (file.action == 'REMOVE') return prepareRemoveType(providerId, file);
      else if (file.action == 'MOVE') return prepareMoveType(providerId, file);
      else if (file.action == 'ADD') return prepareAddType(providerId, file);
      else if (file.action == 'CHANGE') return prepareChangeType(providerId, file);
      else {
        isNotRelevant(file, index);
      }
    }).filter(set => set);
}

function isNotRelevant(file, index) {
  log.debug('Ignoring change %s', file.id, file.path, file, index);
}

function prepareAddType(providerId, file) {
  return _getFileNodes(providerId, file.parentId)
    .flatMap(parentNodes => {
      parentNodes.push(file.name);
      file.path = _nodesToPath(parentNodes);
      return file;
    });
}

function prepareRemoveType(providerId, file) {
  return cloudIndex.get(providerId, file.id)
    .flatMap(index => {
      return _getFileNodes(providerId, file.id)
        .flatMap(nodes => {
          let pathOrigin = _nodesToPath(nodes);

          if (pathOrigin == '/') {
            return Bacon.Error('Broken node hierarchy for fileId %s found. Ignoring to prevent side effects. path = /');
          }

          file.path = pathOrigin;
          return file;
        });
    });
}

function prepareMoveType(providerId, file) {
  return _getFileNodes(providerId, file.parentId)
    .flatMap(parentNodes => {
      parentNodes.push(file.name);
      file.path = _nodesToPath(parentNodes);
      return file;
    });
}

function prepareChangeType(providerId, file) {
  return _getFileNodes(providerId, file.id)
    .flatMap(nodes => {
      file.path = _nodesToPath(nodes);
      return file;
    });
}


export function getPathFromIndex(fileId, providerId) {
  return _getFileNodes(providerId, fileId)
    .flatMap(nodes => _nodesToPath(nodes));
}

function _getFileNodes(providerId, fileId) {
  let walkToRoot = (fileId, parents = []) => {
    return cloudIndex.get(providerId, fileId)
      .flatMap(index => {
        if (index && index.name) {
          log.debug('Add for [%s]: %s to path', fileId, index.name);
          parents.push(index.name);
          return walkToRoot(index.parentId, parents);
        } else {
          parents.pop();
          parents.reverse();
          log.debug('Composed index: %s', parents);
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
