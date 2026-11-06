/**
 * Tests for the model layer of js/ui-table.js (the part without DOM).
 * Run all tests from the project root with:  node --test
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/protocol.js');
const T = require('../js/ui-table.js');

const PLUS = P.BASIS.RECTILINEAR;
const DIAG = P.BASIS.DIAGONAL;

/** Finds a row of the model by its id. */
function row(model, id) {
  return model.rows.find((r) => r.id === id);
}

describe('rows', () => {
  it('shows all 11 rows with Eve and hides her 3 rows without her', () => {
    const withEve = T.buildModel(P.runProtocol({ eveEnabled: true }), 8);
    const withoutEve = T.buildModel(P.runProtocol({ eveEnabled: false }), 8);
    assert.equal(withEve.rows.length, 11);
    assert.equal(withoutEve.rows.length, 8);
    assert.ok(withoutEve.rows.every((r) => !r.id.startsWith('eve') && r.id !== 'resent'));
  });

  it('has one cell per photon in every row and one column per photon', () => {
    const run = P.runProtocol({ photons: 20, eveEnabled: true });
    const model = T.buildModel(run, 8);
    assert.equal(model.columns.length, 20);
    for (const r of model.rows) {
      assert.equal(r.cells.length, 20);
    }
  });
});

describe('step by step', () => {
  it('fills only the rows of the steps reached so far', () => {
    const run = P.runProtocol({ eveEnabled: true });
    for (let step = 1; step <= 8; step++) {
      const model = T.buildModel(run, step);
      for (const r of model.rows) {
        const rowStep = T.ROWS.find((x) => x.id === r.id).step;
        if (rowStep > step) {
          assert.equal(r.state, 'pending');
          assert.ok(r.cells.every((c) => c.text === '·' && c.classes.includes('is-future')));
        } else {
          assert.equal(r.state, rowStep === step ? 'active' : 'done');
        }
      }
    }
  });

  it('marks Bob\'s wrong bits only from step 6, when the bases are compared', () => {
    const run = P.runProtocol({ eveEnabled: true });   // demo run: photons 3 and 4 are errors
    const before = row(T.buildModel(run, 5), 'bobBit');
    const after = row(T.buildModel(run, 6), 'bobBit');
    assert.ok(before.cells.every((c) => !c.classes.includes('is-error')));
    assert.ok(after.cells[2].classes.includes('is-error'));
    assert.ok(after.cells[3].classes.includes('is-error'));
  });

  it('dims the columns of discarded photons from step 6', () => {
    const run = P.runProtocol({ eveEnabled: true });
    const at5 = T.buildModel(run, 5);
    const at6 = T.buildModel(run, 6);
    assert.ok(at5.columns.every((c) => !c.dimmed));
    run.photons.forEach((p, i) => {
      assert.equal(at6.columns[i].dimmed, !p.basesMatch);
      assert.equal(row(at6, 'aliceBit').cells[i].classes.includes('is-dimmed'), !p.basesMatch);
    });
  });
});

describe('cell contents', () => {
  it('shows bases as + and ×, and photons by their polarization', () => {
    assert.equal(T.basisText(PLUS), '+');
    assert.equal(T.basisText(DIAG), '×');
    assert.deepEqual([T.photonGlyph(PLUS, 0), T.photonGlyph(PLUS, 1), T.photonGlyph(DIAG, 0), T.photonGlyph(DIAG, 1)],
      ['—', '|', '/', '\\']);
  });

  it('matches the photon records in the demo run', () => {
    const run = P.runProtocol({ eveEnabled: true });
    const model = T.buildModel(run, 8);
    run.photons.forEach((p, i) => {
      assert.equal(row(model, 'eveBit').cells[i].classes.includes('is-random'), p.eveRandom);
      assert.equal(row(model, 'resent').cells[i].classes.includes('is-disturbed'), p.eveRandom);
      assert.equal(row(model, 'bobBit').cells[i].classes.includes('is-random'), p.bobRandom);
      assert.equal(row(model, 'match').cells[i].text, p.basesMatch ? '✓' : '✗');
      let check = '';
      if (p.basesMatch) {
        check = !p.sampled ? '·' : p.error ? '≠' : '=';
      }
      assert.equal(row(model, 'check').cells[i].text, check);
    });
  });

  it('shows a dash in Eve\'s rows for photons she did not intercept', () => {
    const run = P.runProtocol({ photons: 30, eveEnabled: true, eveRate: 0.5 });
    const model = T.buildModel(run, 8);
    const skipped = run.photons.filter((p) => !p.intercepted);
    assert.ok(skipped.length > 0);
    for (const p of skipped) {
      for (const id of ['eveBasis', 'eveBit', 'resent']) {
        assert.equal(row(model, id).cells[p.index].text, '–');
      }
      assert.equal(row(model, 'eveBasis').cells[p.index].edit, null, 'not editable');
    }
  });

  it('marks the key bits as kept or discarded according to the decision', () => {
    const aborted = P.runProtocol({ eveEnabled: true });
    const accepted = P.runProtocol({ eveEnabled: false });
    const keyCells = (run) => row(T.buildModel(run, 8), 'key').cells.filter((c) => c.text !== '');
    assert.ok(keyCells(aborted).every((c) => c.classes.includes('is-discarded')));
    assert.ok(keyCells(accepted).every((c) => c.classes.includes('is-key')));
  });
});

describe('editing', () => {
  it('offers the flipped value: a bit flips, a basis swaps', () => {
    assert.equal(T.nextValue('aliceBit', 0), 1);
    assert.equal(T.nextValue('aliceBit', 1), 0);
    assert.equal(T.nextValue('bobBasis', PLUS), DIAG);
    assert.equal(T.nextValue('bobBasis', DIAG), PLUS);
  });

  it('makes cells editable only in editable rows whose step is reached', () => {
    const run = P.runProtocol({ eveEnabled: true });
    const model = T.buildModel(run, 3);
    assert.ok(row(model, 'aliceBit').cells.every((c) => c.edit && c.edit.field === 'aliceBit'));
    assert.ok(row(model, 'sent').cells.every((c) => c.edit === null));
    assert.ok(row(model, 'bobBasis').cells.every((c) => c.edit === null), 'step 4 not reached yet');
    const cell = row(model, 'aliceBit').cells[2];
    assert.deepEqual(
      { field: cell.edit.field, index: cell.edit.index, value: cell.edit.value },
      { field: 'aliceBit', index: 2, value: run.photons[2].aliceBit ? 0 : 1 }
    );
  });

  it('marks edited cells', () => {
    const overrides = { bobBasis: { 4: DIAG } };
    const run = P.runProtocol({ eveEnabled: true }, overrides);
    const cells = row(T.buildModel(run, 8, overrides), 'bobBasis').cells;
    cells.forEach((c, i) => assert.equal(c.classes.includes('is-edited'), i === 4));
  });
});