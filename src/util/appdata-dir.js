const path = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.omelettesync';

import mkdirp from 'mkdirp';

mkdirp(path, function(err) {
  if (err) throw err;
});

export default function() {
  return path;
}
