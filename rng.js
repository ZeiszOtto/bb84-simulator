(function (global) {
  'use strict';

  /**
   * Hashes any value to an unsigned 32-bit integer (FNV-1a).
   * Numbers and strings are treated alike: 2026 and "2026" give the same hash.
   *
   * @param {*} input - The seed in any form (number, string, ...).
   * @returns {number} Unsigned 32-bit hash.
   */
  function hashSeed(input) {
    const str = String(input ?? '');
    let hash = 0x811c9dc5; // FNV-1a 32-bit hash
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193); // FNV prime
    }
    return hash >>> 0;
  }


  /**
   * mulberry32: a small 32-bit PRNG with a full 2^32 period.
   *
   * @param {number} state - Unsigned 32-bit initial state.
   * @returns {function(): number} Returns a float in [0, 1) on each call.
   */
  function mulberry32(state) {
    let a = state >>> 0;
    return function() {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }


  /**
   * Creates a seeded random generator.
   *
   * @param {*} seed - Any value; it is hashed to a 32-bit state.
   * @returns {{
   *   next: function(): number,
   *   int: function(number): number,
   *   bit: function(): (0|1),
   *   chance: function(number): boolean,
   *   pick: function(Array): *
   * }}
   */
  function createRNG(seed) {
    const next = mulberry32(hashSeed(seed));

    return {
        /** Float in [0, 1). */
        next,
        
        /** Integer in [0, n). */
        int(n) {
            if (!Number.isInteger(n) || n <= 0) {
                throw new RangeError('int(n) expects a positive integer, got ' + n);
            }
            return Math.floor(next() * n);
        },
        
        /** Fair random bit: 0 or 1. */
        bit() {
            return next() < 0.5 ? 0 : 1;
        },

        /** True with probability p (clamped to [0, 1]). */
        chance(p) {
            return next() < Math.min(1, Math.max(0, p));
        },

        /** Uniformly random element of a non-empty array. */
        pick(items) {
            if (!Array.isArray(items) || items.length === 0) {
            throw new RangeError('pick(items) expects a non-empty array');
            }
            return items[Math.floor(next() * items.length)];
        }
    };
  }


  /**
   * Creates an independent named stream derived from a shared seed,
   * e.g. stream(seed, 'alice'), stream(seed, 'eve'), stream(seed, 'bob').
   *
   * @param {*} seed - The run's seed.
   * @param {string} name - Stream name; different names give unrelated sequences.
   * @returns {ReturnType<typeof createRNG>}
   */
  function stream(seed, name) {
    return createRNG(String(seed ?? '') + '/' + name);
  }


  /**
   * Generates a fresh, human-friendly 4-digit seed for the "Random" button.
   * Uses the Web Crypto API when available, Math.random() otherwise.
   *
   * @returns {string} A seed between "1000" and "9999".
   */
  function randomSeed() {
    let r;
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      r = global.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    } else {
      r = Math.random();
    }
    return String(1000 + Math.floor(r * 9000));
  }
 
  const api = { hashSeed, createRNG, stream, randomSeed };
 
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.BB84 = global.BB84 || {};
    global.BB84.rng = api;
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);