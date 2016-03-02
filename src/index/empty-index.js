import Bacon from 'baconjs';
import db from '../db.js';

const REMOVE = 'DELETE FROM DIRECTORY_INDEX WHERE 1';

export default function emptyIndex() {
  return Bacon.fromCallback(db, 'run', REMOVE, []);
}
