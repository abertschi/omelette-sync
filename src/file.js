
export default class File {

  constructor(parm = {}) {
    this.id = parm.id || '';
    this.path = parm.path || '' ;
    this.action = parm.action || '' ;
    this.timestamp = parm.timestamp || '';
    this.pathOrign = parm.pathOrign || null;
    this.isDir = parm.isDir || null;
  }

};

export const ACTIONS = {
    ADD: 'add',
    ADD_DIR: 'addDir',
    UNLINK: 'unlink',
    UNLINK_DIR: 'unlinkDir',
    CHANGE: 'change',
    UNKNOWN: 'unknown'
};
