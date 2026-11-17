// Seeded randomness for VELDORA BAY: mulberry32 plus the small helpers the
// city builder and the shot stager use, so a seed always rebuilds the same city.

/** A mulberry32 generator: fast, deterministic, good enough for placement. */
export function createRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** Float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** Integer in [min, max]. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** One element of an array. */
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    /** True with the given probability. */
    chance(p) {
      return next() < p;
    },
  };
}
