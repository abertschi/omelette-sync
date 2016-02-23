import Bacon from 'baconjs';
import db from './db.js';

export function createBufferdStream(stream, size) {
  return stream
    .scan([], function(acc, result) {
      if (acc.length === size) {
        acc.shift();
      }
      acc.push(result);
      return acc;
    });
}
