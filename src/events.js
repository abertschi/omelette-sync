const EventEmitter = require('events');

let events = new EventEmitter();

const actions = {

  LOG_ERROR: 'log_error',
  LOG_INFO: 'log_info',
  LOG_TRACE: 'log_trace',
  LOG_ALL: 'log_all',

  DETECT_UPLOAD: 'detect_upload',
  UPLOADING: 'uploading',
  UPLOAD_DONE: 'upload_done',
  UPLOAD_CANCEL: 'upload_cancel',
  UPLOADS_DONE: 'uploads_done',

  DETECT_DOWNLOAD: 'detect_download',
  DOWNLOADING: 'downloading',
  DOWNLOAD_DONE: 'download_done',
  DOWNLOAD_CANCEL: 'download_cancel',
  DOWNLOADS_DONE: 'downloads_done'
}

export {
  actions
};

export default events;
