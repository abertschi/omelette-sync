import Bacon from 'baconjs';
import db from './db.js';

export default function initIndex() {
  const REMOVE = 'DELETE FROM DIRECTORY_INDEX WHERE 1';
  return Bacon
    .fromCallback(db, 'run', REMOVE, []);
}
