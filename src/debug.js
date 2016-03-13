module.exports = function debug(title) {
  return {
    error: require('debug')(`omelette:${title}:err`),
    trace: require('debug')(`omelette:${title}:trace`),
    info: require('debug')(`omelette:${title}:info`),
    debug: require('debug')(`omelette:${title}:debug`),
    msg: require('debug')(`omelette:`)
  }
}
