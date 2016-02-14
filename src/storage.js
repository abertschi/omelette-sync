import storage from 'node-persist';

storage.initSync({
  dir: './../persist',
});

export default storage;
