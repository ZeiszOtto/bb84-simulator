/**
 * Tests for js/protocol.js.
 * Run all tests from the project root with:  node --test
 *
 * Four kinds of tests:
 *   1. Unit tests of the small functions (measure, angleOf, normalizeSettings).
 *   2. A regression test that pins the demo run, so accidental changes show up.
 *   3. Rule tests: properties that must hold for EVERY run, checked over many
 *      different seeds and settings.
 *   4. Statistical tests of the physics over many photons (e.g. QBER = eveRate / 4).
 *      They use fixed seeds, so they are deterministic. Their tolerances are a
 *      few standard deviations wide, so they would also pass with other seeds.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/protocol.js');

const { DECISION } = P;
const PLUS = P.BASIS.RECTILINEAR;
const DIAG = P.BASIS.DIAGONAL;

/** The fields that describe the physics of a photon (everything except the sample/key flags). */
const PHYSICS_FIELDS = [
  'aliceBit', 'aliceBasis', 'intercepted', 'eveBasis', 'eveBit', 'eveRandom',
  'bobBasis', 'bobBit', 'bobRandom', 'basesMatch', 'error'
];

/** Copies only the physics fields of a photon record. */
function physics(photon) {
  const out = {};
  for (const field of PHYSICS_FIELDS) {
    out[field] = photon[field];
  }
  return out;
}

/** Error rate over all sifted bits. Less noisy than the sample QBER. */
function siftedErrorRate(run) {
  return run.siftedErrors / run.siftedIndices.length;
}

/** Allowed deviation of a measured rate: k standard deviations of a proportion q over n trials. */
function tolerance(q, n, k = 4) {
  return k * Math.sqrt((q * (1 - q)) / n);
}

// -----------------------------------------------------------------------------
// 1. Unit tests
// -----------------------------------------------------------------------------

describe('measure', () => {
  it('returns the encoded bit when the bases match, ignoring the coin', () => {
    for (const basis of [PLUS, DIAG]) {
      for (const bit of [0, 1]) {
        for (const coin of [0, 1]) {
          assert.deepEqual(P.measure({ basis, bit }, basis, coin), { bit, random: false });
        }
      }
    }
  });

  it('returns the coin when the bases differ', () => {
    for (const bit of [0, 1]) {
      for (const coin of [0, 1]) {
        assert.deepEqual(P.measure({ basis: PLUS, bit }, DIAG, coin), { bit: coin, random: true });
        assert.deepEqual(P.measure({ basis: DIAG, bit }, PLUS, coin), { bit: coin, random: true });
      }
    }
  });
});


describe('angleOf', () => {
  it('maps the four BB84 states to 0, 90, 45 and 135 degrees', () => {
    assert.equal(P.angleOf(PLUS, 0), 0);
    assert.equal(P.angleOf(PLUS, 1), 90);
    assert.equal(P.angleOf(DIAG, 0), 45);
    assert.equal(P.angleOf(DIAG, 1), 135);
  });
});


describe('normalizeSettings', () => {
  it('fills in every missing setting from DEFAULTS', () => {
    assert.deepEqual(P.normalizeSettings(), { ...P.DEFAULTS });
    assert.deepEqual(P.normalizeSettings({}), { ...P.DEFAULTS });
  });

  it('clamps out-of-range values and rejects non-numbers', () => {
    const s = P.normalizeSettings({ photons: -5, eveRate: 7, sampleFraction: -1, threshold: 'abc' });
    assert.equal(s.photons, 1);
    assert.equal(s.eveRate, 1);
    assert.equal(s.sampleFraction, 0);
    assert.equal(s.threshold, P.DEFAULTS.threshold);
    assert.equal(P.normalizeSettings({ photons: 1e9 }).photons, 100000);
    assert.equal(P.normalizeSettings({ photons: 12.6 }).photons, 13);
  });

  it('returns a frozen object and leaves its input untouched', () => {
    const input = { photons: 999999 };
    const s = P.normalizeSettings(input);
    assert.ok(Object.isFrozen(s));
    assert.deepEqual(input, { photons: 999999 });
  });

  it('treats a numeric seed like the same seed as a string', () => {
    assert.deepEqual(P.runProtocol({ seed: 2026 }), P.runProtocol({ seed: '2026' }));
  });
});

// -----------------------------------------------------------------------------
// 2. Regression test: the demo run
// -----------------------------------------------------------------------------

describe('demo run (seed 1150, 12 photons)', () => {
  // These values were checked by hand against the BB84 rules. If this test fails
  // after an intentional change to rng.js or to the tape layout, update them.
  // Otherwise something changed by accident. Indices are 0-based.

  it('detects Eve', () => {
    const run = P.runProtocol({ seed: '1150', photons: 12, eveEnabled: true });
    assert.deepEqual(run.siftedIndices, [2, 3, 5, 7, 8, 9]);
    assert.deepEqual(run.sampleIndices, [3, 5, 9]);
    assert.deepEqual(run.keyIndices, [2, 7, 8]);
    assert.equal(run.sampleErrors, 1);
    assert.equal(run.qber, 1 / 3);
    assert.equal(run.keyErrors, 1);           // photon 3: an error the sample missed
    assert.deepEqual(run.aliceKey, [1, 1, 0]);
    assert.deepEqual(run.bobKey, [0, 1, 0]);
    assert.equal(run.decision, DECISION.ABORTED);
  });

  it('accepts the key without Eve', () => {
    const run = P.runProtocol({ seed: '1150', photons: 12, eveEnabled: false });
    assert.deepEqual(run.siftedIndices, [2, 3, 5, 7, 8, 9]);
    assert.deepEqual(run.sampleIndices, [3, 5, 9]);
    assert.equal(run.qber, 0);
    assert.deepEqual(run.aliceKey, [1, 1, 0]);
    assert.deepEqual(run.bobKey, [1, 1, 0]);
    assert.equal(run.decision, DECISION.ACCEPTED);
  });
});

// -----------------------------------------------------------------------------
// 3. Rules that hold for every run
// -----------------------------------------------------------------------------

describe('rules that hold for every run', () => {
  // 150 runs with varied seeds, photon counts, Eve settings, sample sizes and modes.
  const runs = [];
  for (let seed = 1; seed <= 150; seed++) {
    runs.push(P.runProtocol({
      seed,
      photons: 1 + (seed % 40),
      eveEnabled: seed % 2 === 0,
      eveRate: (seed % 5) / 4,                       // 0, 0.25, 0.5, 0.75, 1
      sampleFraction: [0, 0.25, 0.5, 1][seed % 4],
      fixedBasis: seed % 7 === 0
    }));
  }

  it('has one record per photon, in order', () => {
    for (const run of runs) {
      assert.equal(run.photons.length, run.settings.photons);
      run.photons.forEach((p, i) => assert.equal(p.index, i));
    }
  });

  it('records Eve only when she intercepts, and only when she is enabled', () => {
    for (const run of runs) {
      for (const p of run.photons) {
        if (!run.settings.eveEnabled) {
          assert.equal(p.intercepted, false);
        }
        if (p.intercepted) {
          assert.ok(p.eveBasis === PLUS || p.eveBasis === DIAG);
          assert.ok(p.eveBit === 0 || p.eveBit === 1);
        } else {
          assert.equal(p.eveBasis, null);
          assert.equal(p.eveBit, null);
          assert.equal(p.eveRandom, false);
        }
      }
    }
  });

  it('follows the measurement rule for Eve and Bob', () => {
    for (const run of runs) {
      for (const p of run.photons) {
        if (p.intercepted) {
          assert.equal(p.eveRandom, p.eveBasis !== p.aliceBasis);
          if (!p.eveRandom) {
            assert.equal(p.eveBit, p.aliceBit);
          }
        }
        // Bob measures the photon that arrives: Eve's resend, or Alice's original.
        const arrivingBasis = p.intercepted ? p.eveBasis : p.aliceBasis;
        const arrivingBit = p.intercepted ? p.eveBit : p.aliceBit;
        assert.equal(p.bobRandom, p.bobBasis !== arrivingBasis);
        if (!p.bobRandom) {
          assert.equal(p.bobBit, arrivingBit);
        }
      }
    }
  });

  it('sifts on Alice and Bob bases only, and counts errors only there', () => {
    for (const run of runs) {
      for (const p of run.photons) {
        assert.equal(p.basesMatch, p.aliceBasis === p.bobBasis);
        assert.equal(p.error, p.basesMatch && p.bobBit !== p.aliceBit);
      }
      const expected = run.photons.filter((p) => p.basesMatch).map((p) => p.index);
      assert.deepEqual(run.siftedIndices, expected);
    }
  });

  it('splits the sifted bits into a sample and a key', () => {
    for (const run of runs) {
      const sifted = new Set(run.siftedIndices);
      const sample = new Set(run.sampleIndices);
      assert.equal(run.sampleIndices.length, Math.round(run.settings.sampleFraction * sifted.size));
      assert.ok(run.sampleIndices.every((i) => sifted.has(i)), 'sample is a subset of the sifted bits');
      assert.deepEqual(run.keyIndices, run.siftedIndices.filter((i) => !sample.has(i)));
      assert.deepEqual([...run.sampleIndices].sort((a, b) => a - b), run.sampleIndices, 'sample is sorted');
      for (const p of run.photons) {
        assert.equal(p.sampled, sample.has(p.index));
        assert.equal(p.inKey, sifted.has(p.index) && !sample.has(p.index));
      }
    }
  });

  it('reports counts, QBER and keys consistent with the photon records', () => {
    for (const run of runs) {
      const errorsIn = (indices) => indices.filter((i) => run.photons[i].error).length;
      assert.equal(run.sampleErrors, errorsIn(run.sampleIndices));
      assert.equal(run.siftedErrors, errorsIn(run.siftedIndices));
      assert.equal(run.keyErrors, errorsIn(run.keyIndices));
      const expectedQber = run.sampleIndices.length > 0 ? run.sampleErrors / run.sampleIndices.length : null;
      assert.equal(run.qber, expectedQber);
      assert.deepEqual(run.aliceKey, run.keyIndices.map((i) => run.photons[i].aliceBit));
      assert.deepEqual(run.bobKey, run.keyIndices.map((i) => run.photons[i].bobBit));
    }
  });

  it('decides according to the QBER, the threshold and the key length', () => {
    for (const run of runs) {
      let expected;
      if (run.qber === null) {
        expected = DECISION.INSUFFICIENT;
      } else if (run.qber >= run.settings.threshold) {
        expected = DECISION.ABORTED;
      } else if (run.keyIndices.length === 0) {
        expected = DECISION.INSUFFICIENT;
      } else {
        expected = DECISION.ACCEPTED;
      }
      assert.equal(run.decision, expected);
    }
  });

  it('never has errors without an interception', () => {
    for (const run of runs) {
      for (const p of run.photons) {
        if (!p.intercepted) {
          assert.equal(p.error, false);
        }
      }
    }
  });

  it('uses only the + basis in fixed-basis mode', () => {
    for (const run of runs.filter((r) => r.settings.fixedBasis)) {
      for (const p of run.photons) {
        assert.equal(p.aliceBasis, PLUS);
        assert.equal(p.bobBasis, PLUS);
        if (p.intercepted) {
          assert.equal(p.eveBasis, PLUS);
        }
      }
      assert.equal(run.siftedIndices.length, run.photons.length);
    }
  });
});

// -----------------------------------------------------------------------------
// 3b. Rules of the randomness tape: changing one thing must not shift the others
// -----------------------------------------------------------------------------

describe('randomness tape', () => {
  it('gives the same run for the same seed and a different run for another seed', () => {
    const settings = { photons: 50, eveEnabled: true, eveRate: 0.5 };
    assert.deepEqual(P.runProtocol({ ...settings, seed: 'a' }), P.runProtocol({ ...settings, seed: 'a' }));
    assert.notDeepEqual(P.runProtocol({ ...settings, seed: 'a' }), P.runProtocol({ ...settings, seed: 'b' }));
  });

  it('keeps Alice, Bob, the sifting and the sample when Eve is switched on', () => {
    const off = P.runProtocol({ seed: 'toggle', photons: 200, eveEnabled: false });
    const on = P.runProtocol({ seed: 'toggle', photons: 200, eveEnabled: true });
    off.photons.forEach((p, i) => {
      const q = on.photons[i];
      assert.equal(q.aliceBit, p.aliceBit);
      assert.equal(q.aliceBasis, p.aliceBasis);
      assert.equal(q.bobBasis, p.bobBasis);
    });
    assert.deepEqual(on.siftedIndices, off.siftedIndices);
    assert.deepEqual(on.sampleIndices, off.sampleIndices);
  });

  it('only adds intercepted photons when the eavesdropping rate grows', () => {
    const intercepted = (rate) => P.runProtocol({ seed: 'rate', photons: 500, eveEnabled: true, eveRate: rate })
      .photons.filter((p) => p.intercepted).map((p) => p.index);
    const low = intercepted(0.3);
    const high = new Set(intercepted(0.6));
    assert.ok(low.length > 0);
    assert.ok(low.every((i) => high.has(i)), 'every photon intercepted at 30% is also intercepted at 60%');
  });

  it('keeps the first photons unchanged when more photons are added', () => {
    const short = P.runProtocol({ seed: 'grow', photons: 12, eveEnabled: true });
    const long = P.runProtocol({ seed: 'grow', photons: 30, eveEnabled: true });
    short.photons.forEach((p, i) => assert.deepEqual(physics(long.photons[i]), physics(p)));
  });

  it('changes only the edited photon when a cell is edited', () => {
    const settings = { seed: 'edit', photons: 40, eveEnabled: true };
    const before = P.runProtocol(settings);
    const target = 7;
    const flipped = before.photons[target].bobBasis === PLUS ? DIAG : PLUS;
    const after = P.runProtocol(settings, { bobBasis: { [target]: flipped } });
    assert.equal(after.photons[target].bobBasis, flipped);
    before.photons.forEach((p, i) => {
      if (i !== target) {
        assert.deepEqual(physics(after.photons[i]), physics(p));
      }
    });
  });
});

// -----------------------------------------------------------------------------
// 4. Statistics of eavesdropping
// -----------------------------------------------------------------------------

describe('eavesdropping statistics (100 000 photons)', () => {
  const N = 100000;

  it('keeps about half of the photons and has no errors without Eve', () => {
    const run = P.runProtocol({ seed: 'stats', photons: N });
    const sifted = run.siftedIndices.length;
    assert.ok(Math.abs(sifted / N - 0.5) < tolerance(0.5, N), `sifted ${sifted} of ${N}`);
    assert.equal(run.siftedErrors, 0);
    assert.equal(run.qber, 0);
    assert.equal(run.decision, DECISION.ACCEPTED);
  });

  for (const rate of [0.25, 0.5, 0.75, 1]) {
    it(`gives an error rate of about eveRate / 4 = ${rate / 4} for eveRate ${rate}`, () => {
      const run = P.runProtocol({ seed: 'stats', photons: N, eveEnabled: true, eveRate: rate });
      const measured = siftedErrorRate(run);
      const expected = rate / 4;
      const tol = tolerance(expected, run.siftedIndices.length);
      assert.ok(Math.abs(measured - expected) < tol,
        `measured ${measured.toFixed(4)}, expected ${expected} ± ${tol.toFixed(4)}`);
    });
  }

  it('makes Eve undetectable in fixed-basis mode', () => {
    const run = P.runProtocol({ seed: 'stats', photons: N, eveEnabled: true, fixedBasis: true });
    assert.equal(run.siftedIndices.length, N);
    assert.equal(run.siftedErrors, 0);
    assert.equal(run.decision, DECISION.ACCEPTED);
  });

  it('detects a full intercept-resend attack with 1000 photons', () => {
    const run = P.runProtocol({ seed: 'stats', photons: 1000, eveEnabled: true, eveRate: 1 });
    assert.equal(run.decision, DECISION.ABORTED);
  });
});

// -----------------------------------------------------------------------------
// Decision edge cases
// -----------------------------------------------------------------------------

describe('decision edge cases', () => {
  it('is insufficient with a single photon', () => {
    assert.equal(P.runProtocol({ photons: 1 }).decision, DECISION.INSUFFICIENT);
  });

  it('is insufficient when no bits are sampled', () => {
    const run = P.runProtocol({ photons: 100, sampleFraction: 0 });
    assert.equal(run.qber, null);
    assert.equal(run.decision, DECISION.INSUFFICIENT);
  });

  it('is insufficient when every sifted bit is sampled', () => {
    const run = P.runProtocol({ photons: 100, sampleFraction: 1 });
    assert.equal(run.keyIndices.length, 0);
    assert.equal(run.decision, DECISION.INSUFFICIENT);
  });

  it('aborts when the QBER equals the threshold, and accepts just above it', () => {
    // Full interception: about 50 sampled bits with a 25% error chance each,
    // so a QBER of exactly 0 or 1 is practically impossible.
    const settings = { seed: 'edge', photons: 200, eveEnabled: true, eveRate: 1 };
    const q = P.runProtocol(settings).qber;
    assert.ok(q > 0 && q < 1, `need a QBER strictly between 0 and 1, got ${q}`);
    assert.equal(P.runProtocol({ ...settings, threshold: q }).decision, DECISION.ABORTED);
    assert.equal(P.runProtocol({ ...settings, threshold: q + 0.001 }).decision, DECISION.ACCEPTED);
  });
});

// -----------------------------------------------------------------------------
// Manual overrides
// -----------------------------------------------------------------------------

describe('manual overrides', () => {
  it('lets Bob measure in Alice\'s basis and then read her bit', () => {
    const settings = { seed: 'override', photons: 20 };
    const base = P.runProtocol(settings);
    const i = base.photons.findIndex((p) => !p.basesMatch);
    const run = P.runProtocol(settings, { bobBasis: { [i]: base.photons[i].aliceBasis } });
    const p = run.photons[i];
    assert.equal(p.basesMatch, true);
    assert.equal(p.bobRandom, false);
    assert.equal(p.bobBit, p.aliceBit);
  });

  it('wins over fixed-basis mode', () => {
    const run = P.runProtocol({ photons: 5, fixedBasis: true }, { aliceBasis: { 0: DIAG } });
    assert.equal(run.photons[0].aliceBasis, DIAG);
    assert.equal(run.photons[1].aliceBasis, PLUS);
  });

  it('ignores an Eve basis edit when Eve does not intercept', () => {
    const run = P.runProtocol({ photons: 5, eveEnabled: false }, { eveBasis: { 0: DIAG } });
    assert.equal(run.photons[0].eveBasis, null);
  });

  it('applies an Eve basis edit when she intercepts', () => {
    const settings = { seed: 'eve-edit', photons: 5, eveEnabled: true, eveRate: 1 };
    const alice = P.runProtocol(settings).photons[0].aliceBasis;
    const run = P.runProtocol(settings, { eveBasis: { 0: alice } });
    assert.equal(run.photons[0].eveBasis, alice);
    assert.equal(run.photons[0].eveRandom, false); // right basis: no disturbance
  });

  it('rejects invalid values', () => {
    assert.throws(() => P.runProtocol({}, { aliceBasis: { 0: '×' } }), RangeError);
    assert.throws(() => P.runProtocol({}, { aliceBit: { 0: 2 } }), RangeError);
    assert.throws(() => P.runProtocol({}, { aliceBit: { 0: '1' } }), RangeError);
    assert.throws(() => P.runProtocol({}, { bobBasis: { 0: null } }), RangeError);
  });

  it('does not modify the settings or overrides passed in', () => {
    const settings = { seed: 'pure', photons: 10, eveEnabled: true };
    const overrides = { aliceBit: { 2: 1 }, bobBasis: { 3: DIAG } };
    const settingsCopy = structuredClone(settings);
    const overridesCopy = structuredClone(overrides);
    P.runProtocol(settings, overrides);
    assert.deepEqual(settings, settingsCopy);
    assert.deepEqual(overrides, overridesCopy);
  });
});