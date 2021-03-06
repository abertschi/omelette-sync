    var crypto = require('crypto');
    let log = require('./debug.js')('encrypt');

    export default class Encryption {

      constructor(options = {}) {
        this.password = options.password;
        this.algorithm = options.algorithm || 'aes-256-cbc';
      }

      _isStream(readable) {
        return readable instanceof stream.Readable;
      }

      encrypt(text) {
        let encrypt = crypto.createCipher(this.algorithm, this.password);
        cipher.update(text, 'utf8', 'base64');
        return cipher.final('base64')
      }

      decrypt(text) {
          let decypt = crypto.createDecipher(this.algorithm, this.password);
          decypt.update(text, 'utf8', 'base64');
          return decypt.final('base64')
        }
        // manually with openssl: openssl enc -in bean.txt -d -aes-256-cbc -out bean.done.txt -nosalt
      encryptStream(stream, errorHandler) {
        let encrypt = crypto.createCipher(this.algorithm, this.password);
        return stream.on('error', err => {
          if (errorHandler) errorHandler(err);
          log.error(error, error.stack);
        }).pipe(encrypt).on('error', error => {
          if (errorHandler) errorHandler(error);
          log.error(error, error.stack);
        });
      }

      decryptStream(stream, errorHandler) {
        return stream.on('error', err => {
          log.error(err);
          if (errorHandler) errorHandler(err);
        }).pipe(this.decrypt).on('error', err => {
          log.error(err);
          if (errorHandler) errorHandler(err);
        });
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
