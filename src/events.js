const EventEmitter = require('events');

let events = new EventEmitter();

const actions = {
  ERROR: 'ERROR',
  CLIENT_CHANGE: 'CLIENT_CHANGE',
  CLOUD_CHANGE: 'CLOUD_CHANGE',
  UPLOADING: 'UPLOADING',
  UPLOAD_DONE: 'UPLOAD_DONE',
  DOWNLOADING: 'DOWNLOADING',
  UPLOADS_DONE: 'UPLOADS_DONE',
  DOWNLOAD_DONE: 'DOWNLOAD_DONE',
  DOWNLOADS_DONE: 'DOWNLOADS_DONE'
}

export {
  actions
};

export default events;
