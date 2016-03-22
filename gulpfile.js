var gulp = require('gulp');
var concat = require('gulp-concat');

var modConcat = require("node-module-concat");


gulp.task('default', function() {
  modConcat("./lib/main.js", './out.js', function(err, files) {
    if (err) throw err;
    console.log(files.length + " were combined");
  });

});
