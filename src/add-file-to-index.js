import Bacon from 'baconjs';

export default function addFileToIndex(file, db) {

  const QUERY = 'INSERT INTO DIRECTORY_INDEX(file_id, path) VALUES (?, ?)';

  return Bacon
    .fromCallback(db, 'run', QUERY, [file.id, file.path]);

}
