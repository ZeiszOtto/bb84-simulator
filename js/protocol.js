/**
 * protocol.js — Core BB84 protocol logic (no DOM, no UI).
 *
 * Every function here is pure: the same settings and overrides always
 * produce the same run. The UI only decides how much of a finished run to
 * show (the current step), so stepping back and forth never changes a result.
 *
 * Physics model (BB84 with polarized photons):
 *   - A photon carries one bit in one of two bases:
 *       '+' rectilinear:  bit 0 -> 0°  (horizontal),  bit 1 -> 90°  (vertical)
 *       'x' diagonal:     bit 0 -> 45° (diagonal),    bit 1 -> 135° (anti-diagonal)
 *   - Measuring in the SAME basis returns the encoded bit with certainty.
 *   - Measuring in the OTHER basis returns a uniformly random bit, and the
 *     photon is left in the measured basis: its original state is lost.
 *   - Photons cannot be copied (no-cloning theorem), so an eavesdropper has
 *     to measure the photon she intercepts, and may disturb it.
 *
 * Attack model: intercept-resend. Eve intercepts each photon with
 * probability eveRate, measures it in a random basis, and sends Bob a new
 * photon prepared in her basis with her measured bit.
 * Expected QBER on the sifted key: eveRate / 4.
 *
 * Works as a classic browser script (exposes window.BB84.protocol; rng.js
 * must be loaded first) and as a Node.js module for the test suite.
 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const rng = isNode ? require('./rng.js') : (global.BB84 && global.BB84.rng);
  if (!rng) {
    throw new Error('protocol.js: load rng.js before protocol.js');
  }

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  /** The two bases. Internally 'x' is used for the diagonal basis; the UI shows '×'. */
  const BASIS = Object.freeze({
    RECTILINEAR: '+',
    DIAGONAL: 'x'
  });

  /** Both bases as a list, for random picks and validation. */
  const BASES = Object.freeze([BASIS.RECTILINEAR, BASIS.DIAGONAL]);

  /** Possible outcomes of a run. */
  const DECISION = Object.freeze({
    ACCEPTED: 'accepted',         // QBER below the threshold: the key is kept
    ABORTED: 'aborted',           // QBER at or above the threshold: eavesdropping suspected
    INSUFFICIENT: 'insufficient'  // too few bits to estimate the QBER or to form a key
  });

  /** Default settings. All rates are fractions in [0, 1], not percentages. */
  const DEFAULTS = Object.freeze({
    seed: '1150',          // chosen because its 12-photon run is a clear demo
    photons: 12,
    eveEnabled: false,
    eveRate: 1,            // probability that Eve intercepts a given photon
    sampleFraction: 0.5,   // share of the sifted bits revealed for the error check
    threshold: 0.11,       // abort when QBER >= threshold
    fixedBasis: false      // demo mode: every party always uses '+'
  });

  const MAX_PHOTONS = 100000;

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  /**
   * Converts a value to a number and clamps it to [min, max].
   * Falls back to `fallback` when the value is not a finite number.
   */
  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, n));
  }

  /**
   * Fills in missing settings from DEFAULTS and clamps every value to its
   * valid range, so the rest of the code can trust the settings.
   *
   * @param {object} [settings] - Partial settings; missing keys use DEFAULTS.
   * @returns {object} A complete, frozen settings object.
   */
  function normalizeSettings(settings) {
    const s = { ...DEFAULTS, ...settings };
    return Object.freeze({
      seed: String(s.seed ?? DEFAULTS.seed),
      photons: Math.round(clampNumber(s.photons, 1, MAX_PHOTONS, DEFAULTS.photons)),
      eveEnabled: Boolean(s.eveEnabled),
      eveRate: clampNumber(s.eveRate, 0, 1, DEFAULTS.eveRate),
      sampleFraction: clampNumber(s.sampleFraction, 0, 1, DEFAULTS.sampleFraction),
      threshold: clampNumber(s.threshold, 0, 1, DEFAULTS.threshold),
      fixedBasis: Boolean(s.fixedBasis)
    });
  }

  // ---------------------------------------------------------------------------
  // Physics
  // ---------------------------------------------------------------------------

  /**
   * The one quantum rule the simulator needs: measuring a BB84 photon.
   *
   * @param {{basis: string, bit: (0|1)}} photon - The photon's prepared state.
   * @param {string} measBasis - The basis the receiver measures in.
   * @param {(0|1)} coin - A pre-drawn fair random bit. It is used only when
   *   the bases differ, because the outcome is then 50/50.
   * @returns {{bit: (0|1), random: boolean}} The measured bit and whether it
   *   was a coin flip. After the measurement the photon is in the state
   *   {basis: measBasis, bit: result.bit}.
   */
  function measure(photon, measBasis, coin) {
    if (photon.basis === measBasis) {
      return { bit: photon.bit, random: false };
    }
    return { bit: coin, random: true };
  }

  /**
   * Polarization angle of a photon in degrees: 0, 90, 45 or 135.
   *
   * @param {string} basis - '+' or 'x'.
   * @param {(0|1)} bit
   * @returns {number}
   */
  function angleOf(basis, bit) {
    return (basis === BASIS.RECTILINEAR ? 0 : 45) + (bit ? 90 : 0);
  }

  // ---------------------------------------------------------------------------
  // Randomness tape
  // ---------------------------------------------------------------------------

  /**
   * Draws every random value a run could need, up front.
   *
   * Each party has its own stream, and every photon consumes a FIXED number
   * of draws from each stream, including values that may never be used
   * (for example a coin flip when the bases happen to match). Photon i's
   * random values therefore depend only on (seed, i). Turning Eve on,
   * changing her rate, editing a cell or adding photons never shifts any
   * other random value.
   *
   * @param {string} seed
   * @param {number} n - Number of photons.
   * @returns {Array<object>} One record of raw random values per photon.
   */
  function drawTape(seed, n) {
    const alice = rng.stream(seed, 'alice');
    const eve = rng.stream(seed, 'eve');
    const bob = rng.stream(seed, 'bob');
    const pub = rng.stream(seed, 'public');

    const tape = new Array(n);
    for (let i = 0; i < n; i++) {
      // Object literal properties are evaluated top to bottom,
      // so the draw order within each stream is fixed.
      tape[i] = {
        aliceBit: alice.bit(),
        aliceBasis: alice.pick(BASES),
        eveTap: eve.next(),          // Eve intercepts when this is below eveRate
        eveBasis: eve.pick(BASES),
        eveCoin: eve.bit(),          // Eve's result if she picks the wrong basis
        bobBasis: bob.pick(BASES),
        bobCoin: bob.bit(),          // Bob's result if his basis differs
        sampleKey: pub.next()        // random rank used to choose the check sample
      };
    }
    return tape;
  }

  // ---------------------------------------------------------------------------
  // Manual overrides
  // ---------------------------------------------------------------------------

  /**
   * Returns the user's override for photon i if there is one, otherwise
   * the fallback value.
   *
   * @param {object|undefined} map - Photon index -> value, e.g. { 3: 1, 7: 0 }.
   * @param {number} i - Photon index.
   * @param {*} fallback - The value to use when there is no override.
   * @param {Array} allowed - Valid values; anything else is a programming error.
   */
  function resolve(map, i, fallback, allowed) {
    const value = map ? map[i] : undefined;
    if (value === undefined) {
      return fallback;
    }
    if (!allowed.includes(value)) {
      throw new RangeError(`Invalid override ${JSON.stringify(value)} for photon ${i}`);
    }
    return value;
  }

  // ---------------------------------------------------------------------------
  // The protocol
  // ---------------------------------------------------------------------------

  /**
   * Runs one complete BB84 exchange.
   *
   * @param {object} [settings] - See DEFAULTS.
   * @param {object} [overrides] - Manual edits, keyed by photon index:
   *   { aliceBit: {i: 0|1}, aliceBasis: {i: '+'|'x'},
   *     eveBasis: {i: '+'|'x'}, bobBasis: {i: '+'|'x'} }
   *   An override always wins over both the random value and fixedBasis.
   *   Measurement results are never overridden: they are recomputed from
   *   the (possibly edited) choices, using the same pre-drawn coins.
   * @returns {object} The full run; the fields are listed at the end.
   */
  function runProtocol(settings, overrides) {
    const s = normalizeSettings(settings);
    const ov = overrides || {};
    const tape = drawTape(s.seed, s.photons);

    // In fixedBasis mode the basis is a public rule of the protocol, so every
    // party, Eve included, uses '+'. Otherwise each uses its random pick.
    const chooseBasis = (randomBasis) => (s.fixedBasis ? BASIS.RECTILINEAR : randomBasis);

    const photons = [];
    for (let i = 0; i < s.photons; i++) {
      const t = tape[i];

      // Steps 1-2: Alice prepares a photon.
      const aliceBit = resolve(ov.aliceBit, i, t.aliceBit, [0, 1]);
      const aliceBasis = resolve(ov.aliceBasis, i, chooseBasis(t.aliceBasis), BASES);
      const sent = { basis: aliceBasis, bit: aliceBit };

      // Step 3: Eve may intercept, measure and resend.
      const intercepted = s.eveEnabled && t.eveTap < s.eveRate;
      let eveBasis = null;
      let eveBit = null;
      let eveRandom = false;   // true: wrong basis, so she also disturbed the photon
      let arriving = sent;     // the photon that actually reaches Bob
      if (intercepted) {
        eveBasis = resolve(ov.eveBasis, i, chooseBasis(t.eveBasis), BASES);
        const e = measure(sent, eveBasis, t.eveCoin);
        eveBit = e.bit;
        eveRandom = e.random;
        arriving = { basis: eveBasis, bit: eveBit };
      }

      // Steps 4-5: Bob measures whatever arrives.
      const bobBasis = resolve(ov.bobBasis, i, chooseBasis(t.bobBasis), BASES);
      const b = measure(arriving, bobBasis, t.bobCoin);

      // Step 6 compares only Alice's and Bob's bases, never Eve's.
      const basesMatch = aliceBasis === bobBasis;

      photons.push({
        index: i,
        aliceBit,
        aliceBasis,
        intercepted,
        eveBasis,
        eveBit,
        eveRandom,
        bobBasis,
        bobBit: b.bit,
        bobRandom: b.random,
        basesMatch,
        error: basesMatch && b.bit !== aliceBit,
        sampled: false,   // set below
        inKey: false      // set below
      });
    }

    // Step 6: sifting. Keep the positions where the bases match.
    const siftedIndices = photons.filter((p) => p.basesMatch).map((p) => p.index);

    // Step 7: Alice picks a random subset of the sifted bits to compare in
    // public. Sorting by the pre-drawn random rank and taking the first k
    // selects exactly k random positions without drawing anything new.
    const sampleSize = Math.round(s.sampleFraction * siftedIndices.length);
    const sampleIndices = siftedIndices
      .slice()
      .sort((a, b) => tape[a].sampleKey - tape[b].sampleKey)
      .slice(0, sampleSize)
      .sort((a, b) => a - b);
    sampleIndices.forEach((i) => { photons[i].sampled = true; });

    const sampleErrors = sampleIndices.filter((i) => photons[i].error).length;
    const qber = sampleSize > 0 ? sampleErrors / sampleSize : null;

    // The sifted bits that were not revealed form the key.
    const keyIndices = siftedIndices.filter((i) => !photons[i].sampled);
    keyIndices.forEach((i) => { photons[i].inKey = true; });

    // Step 8: decision.
    let decision;
    if (qber === null) {
      decision = DECISION.INSUFFICIENT;
    } else if (qber >= s.threshold) {
      decision = DECISION.ABORTED;
    } else if (keyIndices.length === 0) {
      decision = DECISION.INSUFFICIENT;
    } else {
      decision = DECISION.ACCEPTED;
    }

    return {
      settings: s,                                   // the normalized settings used
      photons,                                       // one record per photon
      siftedIndices,                                 // step 6: matching bases
      sampleIndices,                                 // step 7: revealed for the check
      keyIndices,                                    // the remaining sifted bits
      sampleErrors,                                  // mismatches found in the sample
      qber,                                          // sampleErrors / sample size, or null
      siftedErrors: siftedIndices.filter((i) => photons[i].error).length,
      keyErrors: keyIndices.filter((i) => photons[i].error).length,  // undetected errors
      aliceKey: keyIndices.map((i) => photons[i].aliceBit),
      bobKey: keyIndices.map((i) => photons[i].bobBit),
      decision
    };
  }

  const api = {
    BASIS,
    BASES,
    DECISION,
    DEFAULTS,
    normalizeSettings,
    measure,
    angleOf,
    drawTape,
    runProtocol
  };

  if (isNode) {
    module.exports = api;
  } else {
    global.BB84 = global.BB84 || {};
    global.BB84.protocol = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);