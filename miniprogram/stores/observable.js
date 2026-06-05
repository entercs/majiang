/**
 * Minimal observable (~30 line implementation)
 * Usage:
 *   const obs = observable({ count: 0 });
 *   const dispose = autorun(() => console.log(obs.count));
 *   obs.count = 1;  // triggers console.log
 *   dispose();
 */

function observable(obj) {
  const listeners = new Set();
  return new Proxy(obj, {
    set(target, key, value) {
      target[key] = value;
      listeners.forEach(fn => fn(target[key], key));
      return true;
    },
    get(target, key) {
      return target[key];
    },
  });
}

function autorun(fn) {
  let prevDeps = null;
  function wrapper() {
    const newDeps = new Set();
    const result = fn(newDeps.add.bind(newDeps));
    if (prevDeps) prevDeps.forEach(d => d.delete(wrapper));
    newDeps.forEach(d => d.add(wrapper));
    prevDeps = newDeps;
    return result;
  }
  wrapper();
  return () => {
    if (prevDeps) prevDeps.forEach(d => d.delete(wrapper));
  };
}

module.exports = { observable, autorun };
