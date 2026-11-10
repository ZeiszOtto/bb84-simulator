/**
 * Tests for the formatting helpers of js/ui-common.js.
 * Run all tests from the project root with:  node --test
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/ui-common.js');

describe('percent', () => {
  it('rounds a fraction to a whole percentage', () => {
    assert.equal(C.percent(0), '0%');
    assert.equal(C.percent(1 / 3), '33%');
    assert.equal(C.percent(0.125), '13%');
    assert.equal(C.percent(1), '100%');
  });
});

describe('article', () => {
  it('uses "az" before numbers spoken with a leading vowel', () => {
    for (const n of [1, 5, 50, 55, 59, 500]) {
      assert.equal(C.article(n), 'az', `az ${n}`);
    }
  });

  it('uses "a" before every other number', () => {
    for (const n of [0, 2, 3, 4, 6, 10, 11, 15, 21, 25, 32, 49, 60, 100]) {
      assert.equal(C.article(n), 'a', `a ${n}`);
    }
  });
});

describe('photonList', () => {
  it('numbers the photons from 1 and puts the right article in front', () => {
    assert.equal(C.photonList([2]), 'a 3.');
    assert.equal(C.photonList([0]), 'az 1.');
    assert.equal(C.photonList([4]), 'az 5.');
    assert.equal(C.photonList([0, 2]), 'az 1. és 3.');
    assert.equal(C.photonList([1, 2, 6]), 'a 2., 3. és 7.');
  });

  it('returns an empty string for no photons', () => {
    assert.equal(C.photonList([]), '');
  });
});