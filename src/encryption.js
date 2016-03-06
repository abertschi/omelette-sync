    var crypto = require('crypto');

    let debug = require('debug')('bean:app');

    export default class Encryption {

      constructor(options = {}) {
        this.password = options.password;
        this.algorithm = options.algorithm || 'aes-256-ecb';
      }

      encryptStream(stream) {
        let encrypt = crypto.createCipher(this.algorithm, this.password);

        return stream.on('error', error => {
          debug(error, error.stack);
          throw error;
        }).pipe(encrypt).on('error', error => {
          debug(error, error.stack);
          throw error;
        });
      }

      decryptStream(stream) {
        return stream.on('error', err => {}).pipe(this.decrypt).on('error', err => {});
      }
    }

    // var fs = require('fs');
    // var zlib = require('zlib');
    //
    // // input file
    // var r = fs.createReadStream('file.txt');
    // // zip content
    // var zip = zlib.createGzip();
    // // encrypt content
    //
    // // decrypt content
    //
    // // unzip content
    // var unzip = zlib.createGunzip();
    // // write file
    // var w = fs.createWriteStream('file.out.txt');
    //
    // // start pipe
