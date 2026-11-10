/**
 * Tests for the model layer of js/ui-channel.js (the part without DOM).
 * Run all tests from the project root with:  node --test
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/protocol.js');
const CH = require('../js/ui-channel.js');

describe('active party', () => {
  it('follows the protocol: Alice, Eve, Bob, then the public channel', () => {
    const expected = ['alice', 'alice', 'eve', 'bob', 'bob', 'public', 'public', 'public'];
    expected.forEach((party, i) => assert.equal(CH.activeParty(i + 1), party, `step ${i + 1}`));
  });
});

describe('photons on the channel', () => {
  it('sends no photons before step 2, then one chip per photon', () => {
    const run = P.runProtocol({ photons: 16 });
    assert.equal(CH.describeChannel(run, 1).firstLink.chips.length, 0);
    assert.equal(CH.describeChannel(run, 2).firstLink.chips.length, 16);
  });

  it('shows Eve and her link only when she is enabled', () => {
    const without = CH.describeChannel(P.runProtocol({ eveEnabled: false }), 8);
    const withEve = CH.describeChannel(P.runProtocol({ eveEnabled: true }), 8);
    assert.equal(without.showEve, false);
    assert.equal(without.secondLink.chips.length, 0);
    assert.equal(withEve.showEve, true);
    assert.equal(withEve.secondLink.chips.length, 12);
  });

  it('fills Eve\'s link from step 3 and marks exactly the disturbed photons', () => {
    const run = P.runProtocol({ eveEnabled: true });
    assert.equal(CH.describeChannel(run, 2).secondLink.chips.length, 0);
    const chips = CH.describeChannel(run, 3).secondLink.chips;
    run.photons.forEach((p, i) => assert.equal(chips[i].disturbed, p.eveRandom));
  });

  it('passes photons Eve did not intercept unchanged', () => {
    const run = P.runProtocol({ photons: 30, eveEnabled: true, eveRate: 0.5 });
    const model = CH.describeChannel(run, 3);
    for (const p of run.photons.filter((x) => !x.intercepted)) {
      assert.deepEqual(model.secondLink.chips[p.index], model.firstLink.chips[p.index]);
    }
  });
});

describe('public channel', () => {
  it('stays quiet before step 6', () => {
    const run = P.runProtocol({ eveEnabled: true });
    for (let step = 1; step <= 5; step++) {
      const model = CH.describeChannel(run, step);
      assert.equal(model.publicActive, false);
      assert.match(model.publicText, /Még nincs forgalom/);
    }
  });

  it('names the kept positions in step 6 and mentions that Eve listens too', () => {
    // Demo run: the bases match at photons 3, 4, 6, 8, 9 and 10.
    const withEve = CH.publicText(P.runProtocol({ eveEnabled: true }), 6);
    const without = CH.publicText(P.runProtocol({ eveEnabled: false }), 6);
    assert.match(withEve, /a 3\., 4\., 6\., 8\., 9\. és 10\. fotonnál/);
    assert.match(withEve, /Eve is hallja/);
    assert.doesNotMatch(without, /Eve/);
  });

  it('names the sampled photons in step 7 and the decision in step 8', () => {
    const run = P.runProtocol({ eveEnabled: true });   // sample: photons 4, 6 and 10; aborted
    assert.match(CH.publicText(run, 7), /a 4\., 6\. és 10\. foton bitjét/);
    assert.match(CH.publicText(run, 8), /eldobják/);
    assert.match(CH.publicText(P.runProtocol({ eveEnabled: false }), 8), /elfogadják/);
  });
});