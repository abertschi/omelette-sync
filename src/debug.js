 var util = require('util')
 import colors from 'colors';

 module.exports = function debug(title) {
   return {
     error: get(`omelette:${title}:err`),
     trace: get(`omelette:${title}:trace`),
     info: get(`omelette:${title}:info`),
     debug: get(`omelette:${title}:debug`),
     msg: get('debug')(`omelette:`)
   }
 }

 function get(title) {
   let debug = require('debug')(title);
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
     debug.apply(null, options);
   };
 }

 var type = Function.prototype.call.bind(Object.prototype.toString);

 function isObject(obj) {
   return type(obj) === '[object Object]';
 }
