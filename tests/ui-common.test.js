/**
 * Tests for the formatting helpers of js/ui-common.js.
 * (The Hungarian article and photon lists are tested in i18n.test.js.)
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
