export default function mergeObjects(base, changes) {
  if (!base) {
    base = {};
  }
  if (changes) {
    for (let attrname in changes) {
      base[attrname] = changes[attrname];
    }
  }
  return base;
}
