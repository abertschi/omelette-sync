import GoogleDriveApi from './google-drive-api.js';
export default class GoogleDrive extends GoogleDriveApi {

  constructor(options) {
      super(options);
      this.auth = options.auth;
    }

  getProviderId() {

  }

  postUpload(request, response) {

  }

  postDownload(request, response) {

  }

  postMove(request, response) {

  }

  postRemove(request, response) {

  }

  postCreateFolder(request, response) {

  }

}
