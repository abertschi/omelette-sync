import colors from 'colors';
import util from 'util';
import events from './events.js'

let type = Function.prototype.call.bind(Object.prototype.toString);

module.exports = function debug(title) {
  return {
    error: error(`omelette:${title}:error`, 'error'),
    trace: get(`omelette:${title}:trace`, 'trace'),
    info: get(`omelette:${title}:info`, 'info'),
    debug: get(`omelette:${title}:debug`, 'debug'),
    msg: get(`omelette:`, 'msg')
  }
}

function emitEvent(lvl, namespace, args) {
  let msg = util.format.apply(this, args);
  events.emit(`log_${lvl}`, namespace, msg);
  events.emit('log_all', lvl, namespace, msg);
}

function error(namespace, lvl) {
  let debug = require('debug')(namespace);

  return function() {
    let args = Array.prototype.slice.call(arguments, 0);
    let options = [];
    for (let i = 0; i < args.length; i++) {
      let arg = args[i];
      options.push(colors.red(arg));
    }
    emitEvent(lvl, namespace, options);
    debug.apply(null, options);
  };
}

function get(namespace, lvl) {
  let debug = require('debug')(namespace);

  return function() {
    let args = Array.prototype.slice.call(arguments, 0);
    let options = [];
    for (let i = 0; i < args.length; i++) {
      let arg = args[i];
      let push;

      if (isObject(arg) || i > 0) {
        push = util.inspect(arg, false, null, true);
      } else {
        push = arg;
      }
      options.push(push);
    }

    emitEvent(lvl, namespace, options);
    debug.apply(null, options);
  };
}

function isObject(obj) {
  return type(obj) === '[object Object]';
}
