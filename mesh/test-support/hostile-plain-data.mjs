// Test-only builders for hostile in-process inputs: counting Proxies and
// counting accessors placed at every position of an otherwise valid document.

const TRAPS = [
  'apply', 'construct', 'defineProperty', 'deleteProperty', 'get',
  'getOwnPropertyDescriptor', 'getPrototypeOf', 'has', 'isExtensible',
  'ownKeys', 'preventExtensions', 'set', 'setPrototypeOf'
];

/**
 * Honest Proxy over `target` that counts every trap. A key in `lies` makes the
 * get trap return that value instead; a function lie is called with the read
 * count for that key, so a lie can flip between reads.
 */
export function countingProxy(target, counter, lies = {}) {
  const reads = new Map();
  const handler = {};
  for (const trap of TRAPS) {
    handler[trap] = (...args) => {
      counter.traps += 1;
      if (trap === 'get' && Object.hasOwn(lies, args[1])) {
        const lie = lies[args[1]];
        const count = (reads.get(args[1]) ?? 0) + 1;
        reads.set(args[1], count);
        return typeof lie === 'function' ? lie(count, Reflect.get(args[0], args[1])) : lie;
      }
      return Reflect[trap](...args);
    };
  }
  return new Proxy(target, handler);
}

function isContainer(value) {
  return value !== null && typeof value === 'object';
}

/** Paths ([] = root) of every object or array node in a plain JSON document. */
export function containerPaths(value, path = []) {
  if (!isContainer(value)) return [];
  const paths = [path];
  for (const key of Object.keys(value)) paths.push(...containerPaths(value[key], [...path, key]));
  return paths;
}

/** Paths of every own property (object fields and array indexes). */
export function propertyPaths(value, path = []) {
  if (!isContainer(value)) return [];
  const paths = [];
  for (const key of Object.keys(value)) {
    paths.push([...path, key]);
    paths.push(...propertyPaths(value[key], [...path, key]));
  }
  return paths;
}

function replaceAt(document, path, replace) {
  if (path.length === 0) return replace(document);
  const copy = structuredClone(document);
  let parent = copy;
  for (const key of path.slice(0, -1)) parent = parent[key];
  const last = path.at(-1);
  parent[last] = replace(parent[last]);
  return copy;
}

/** Valid document whose node at `path` is a counting, otherwise honest Proxy. */
export function withProxyAt(document, path, counter) {
  return replaceAt(document, path, node => countingProxy(node, counter));
}

/** Valid document whose property at `path` is an honest counting accessor. */
export function withAccessorAt(document, path, counter) {
  const copy = structuredClone(document);
  let parent = copy;
  for (const key of path.slice(0, -1)) parent = parent[key];
  const last = path.at(-1);
  const original = parent[last];
  Object.defineProperty(parent, last, {
    enumerable: true,
    configurable: true,
    get() {
      counter.getters += 1;
      return original;
    }
  });
  return copy;
}

export function label(path) {
  return path.length === 0 ? '<root>' : path.join('.');
}
