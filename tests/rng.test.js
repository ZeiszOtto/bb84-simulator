/**
 * Tests for js/rng.js.
 * Run all tests from the project root with:  node --test
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const rng = require('../js/rng.js');

/** Calls `fn` `count` times and collects the results in an array. */
function take(fn, count) {
  return Array.from({ length: count }, () => fn());
}


describe('hashSeed', () => {
  it('is deterministic and treats numbers and strings alike', () => {
    assert.equal(rng.hashSeed('2026'), rng.hashSeed('2026'));
    assert.equal(rng.hashSeed(2026), rng.hashSeed('2026'));
  });
 
  it('gives different hashes for nearby seeds', () => {
    assert.notEqual(rng.hashSeed('2026'), rng.hashSeed('2027'));
  });
 
  it('returns an unsigned 32-bit integer', () => {
    for (const seed of ['', 'a', '2026', 'a much longer seed string']) {
      const h = rng.hashSeed(seed);
      assert.ok(Number.isInteger(h) && h >= 0 && h < 2 ** 32, `hash of "${seed}" is ${h}`);
    }
  });
});


describe('createRng', () => {
  it('reproduces the same sequence for the same seed', () => {
    assert.deepEqual(take(rng.createRng('x').next, 100), take(rng.createRng('x').next, 100));
  });
 
  it('produces different sequences for different seeds', () => {
    assert.notDeepEqual(take(rng.createRng('x').next, 20), take(rng.createRng('y').next, 20));
  });
 
  it('keeps every value in its range', () => {
    const g = rng.createRng('range');
    for (let i = 0; i < 10000; i++) {
      const x = g.next();
      assert.ok(x >= 0 && x < 1, `next() gave ${x}`);
      const k = g.int(6);
      assert.ok(Number.isInteger(k) && k >= 0 && k < 6, `int(6) gave ${k}`);
      assert.ok([0, 1].includes(g.bit()));
      assert.ok(['a', 'b', 'c'].includes(g.pick(['a', 'b', 'c'])));
    }
  });
 
  it('produces fair bits', () => {
    const g = rng.createRng('fair');
    const n = 100000;
    let ones = 0;
    for (let i = 0; i < n; i++) {
      ones += g.bit();
    }
    // A fair coin gives n/2 ones with a standard deviation of sqrt(n/4).
    // Allow 4 standard deviations.
    assert.ok(Math.abs(ones - n / 2) < 4 * Math.sqrt(n / 4), `${ones} ones out of ${n}`);
  });
 
  it('handles the edge cases of chance(p)', () => {
    const g = rng.createRng('chance');
    for (let i = 0; i < 1000; i++) {
      assert.equal(g.chance(0), false);
      assert.equal(g.chance(1), true);
      assert.equal(g.chance(-1), false); // clamped to 0
      assert.equal(g.chance(2), true);   // clamped to 1
    }
  });
 
  it('rejects invalid arguments', () => {
    const g = rng.createRng('bad');
    assert.throws(() => g.int(0), RangeError);
    assert.throws(() => g.int(2.5), RangeError);
    assert.throws(() => g.pick([]), RangeError);
  });
});


describe('stream', () => {
  it('is reproducible', () => {
    assert.deepEqual(take(rng.stream('s', 'alice').next, 50), take(rng.stream('s', 'alice').next, 50));
  });
 
  it('gives different sequences for different names', () => {
    assert.notDeepEqual(take(rng.stream('s', 'alice').next, 50), take(rng.stream('s', 'bob').next, 50));
  });
 
  it('shows no correlation between two streams', () => {
    const a = rng.stream('s', 'alice');
    const b = rng.stream('s', 'bob');
    const n = 100000;
    let agree = 0;
    for (let i = 0; i < n; i++) {
      if (a.bit() === b.bit()) {
        agree++;
      }
    }
    // Independent fair bits agree half of the time.
    assert.ok(Math.abs(agree - n / 2) < 4 * Math.sqrt(n / 4), `${agree} agreements out of ${n}`);
  });
});


describe('randomSeed', () => {
  it('returns a 4-digit string', () => {
    for (let i = 0; i < 100; i++) {
      assert.match(rng.randomSeed(), /^[1-9]\d{3}$/);
    }
  });
});