const EventEmitter = require('events');

let events = new EventEmitter();

const actions = {
  ERROR: 'ERROR',
  CLIENT_CHANGE: 'CLIENT_CHANGE',
  CLOUD_CHANGE: 'CLOUD_CHANGE',
  UPLOADING: 'UPLOADING',
  DOWNLOADING: 'DOWNLOADING',
  UPLOADS_DONE: 'UPLOADS_DONE',
  DOWNLOADS_DONE: 'DOWNLOADS_DONE'
}
