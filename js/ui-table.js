/**
 * ui-table.js — Renders the protocol table: one column per photon, one row
 * per protocol value (Alice's bit, Alice's basis, the sent photon, ...).
 *
 * Two layers:
 *   1. Model (pure functions, no DOM): decides what every cell shows, which
 *      CSS state classes it gets and whether it can be edited. Testable in Node.
 *   2. View (the ProtocolTable class): turns the model into DOM elements and
 *      reports clicks on editable cells to a callback.
 *
 * This file keeps no state of its own. app.js owns the state (settings,
 * current step, manual overrides), runs the protocol and calls render()
 * after every change. A click only produces a request such as
 * { field: 'aliceBit', index: 2, value: 0 }; app.js decides what to do with it.
 *
 * The CSS classes used here are defined in css/style.css.
 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const protocol = isNode ? require('./protocol.js') : (global.BB84 && global.BB84.protocol);
  const i18n = isNode ? require('./i18n.js') : (global.BB84 && global.BB84.i18n);
  const common = isNode ? require('./ui-common.js') : (global.BB84 && global.BB84.ui && global.BB84.ui.common);
  if (!protocol || !i18n || !common) {
    throw new Error('ui-table.js: load protocol.js, i18n.js and ui-common.js before ui-table.js');
  }
  const { BASIS, DECISION } = protocol;
  const { t } = i18n;
  const { el, basisText, photonGlyph } = common;

  // ---------------------------------------------------------------------------
  // Model: rows and cells
  // ---------------------------------------------------------------------------

  /**
   * The rows of the table, top to bottom. Their texts are in i18n.js:
   * the label under 'row.<id>', the actor under 'actor.<actor>'.
   *   step: the protocol step in which the row is filled in
   *   edit: the override field a click changes (editable rows only)
   *   eve:  true for rows that only exist when Eve is enabled
   */
  const ROWS = Object.freeze([
    { id: 'aliceBit',   actor: 'alice',          step: 1, edit: 'aliceBit' },
    { id: 'aliceBasis', actor: 'alice',          step: 2, edit: 'aliceBasis' },
    { id: 'sent',       actor: 'aliceToChannel', step: 2 },
    { id: 'eveBasis',   actor: 'eve',            step: 3, edit: 'eveBasis', eve: true },
    { id: 'eveBit',     actor: 'eve',            step: 3, eve: true },
    { id: 'resent',     actor: 'eveToBob',       step: 3, eve: true },
    { id: 'bobBasis',   actor: 'bob',            step: 4, edit: 'bobBasis' },
    { id: 'bobBit',     actor: 'bob',            step: 5 },
    { id: 'match',      actor: 'public',         step: 6 },
    { id: 'check',      actor: 'publicSample',   step: 7 },
    { id: 'key',        actor: 'aliceBits',      step: 8 }
  ]);

  /** Tooltip that explains a special cell state, e.g. tip('disturbed'). */
  function tip(name) {
    return t(`tip.${name}`);
  }

  /** A cell of a step that has not been reached yet. */
  const FUTURE = Object.freeze({ text: '·', classes: ['is-future'], title: '' });

  /** How a value of an editable field is shown on screen. */
  function valueText(field, value) {
    return field === 'aliceBit' ? String(value) : basisText(value);
  }

  /** The value a click switches to: a bit flips, a basis swaps. */
  function nextValue(field, current) {
    if (field === 'aliceBit') {
      return current ? 0 : 1;
    }
    return current === BASIS.RECTILINEAR ? BASIS.DIAGONAL : BASIS.RECTILINEAR;
  }

  function basisCell(basis) {
    return { text: basisText(basis), classes: [basis === BASIS.RECTILINEAR ? 'basis-plus' : 'basis-diag'], title: '' };
  }

  function photonCell(basis, bit, disturbed) {
    const classes = [basis === BASIS.RECTILINEAR ? 'photon-plus' : 'photon-diag'];
    if (disturbed) {
      classes.push('is-disturbed');
    }
    return { text: photonGlyph(basis, bit), classes, title: disturbed ? tip('disturbed') : '' };
  }

  function notInterceptedCell() {
    return { text: '–', classes: ['is-empty'], title: tip('notIntercepted') };
  }

  function emptyCell() {
    return { text: '', classes: ['is-empty'], title: '' };
  }

  /**
   * What one cell shows once its step has been reached.
   *
   * @param {string} rowId - One of the ids in ROWS.
   * @param {object} p - The photon record from runProtocol.
   * @param {{step: number, accepted: boolean}} ctx - Current step, and whether the key was accepted.
   * @returns {{text: string, classes: string[], title: string}}
   */
  function describeCell(rowId, p, ctx) {
    switch (rowId) {
      case 'aliceBit':
        return { text: String(p.aliceBit), classes: [], title: '' };

      case 'aliceBasis':
        return basisCell(p.aliceBasis);

      case 'sent':
        return photonCell(p.aliceBasis, p.aliceBit, false);

      case 'eveBasis':
        return p.intercepted ? basisCell(p.eveBasis) : notInterceptedCell();

      case 'eveBit':
        if (!p.intercepted) {
          return notInterceptedCell();
        }
        return {
          text: String(p.eveBit),
          classes: p.eveRandom ? ['is-random'] : [],
          title: p.eveRandom ? tip('eveRandom') : ''
        };

      case 'resent':
        return p.intercepted ? photonCell(p.eveBasis, p.eveBit, p.eveRandom) : notInterceptedCell();

      case 'bobBasis':
        return basisCell(p.bobBasis);

      case 'bobBit': {
        const classes = [];
        const titles = [];
        if (p.bobRandom) {
          classes.push('is-random');
          titles.push(tip('bobRandom'));
        }
        // Errors are only revealed once the bases have been compared (step 6).
        if (ctx.step >= 6 && p.error) {
          classes.push('is-error');
          titles.push(tip('error'));
        }
        return { text: String(p.bobBit), classes, title: titles.join('. ') };
      }

      case 'match':
        return p.basesMatch
          ? { text: '✓', classes: ['is-match'], title: '' }
          : { text: '✗', classes: ['is-nomatch'], title: '' };

      case 'check':
        if (!p.basesMatch) {
          return emptyCell();
        }
        if (!p.sampled) {
          return { text: '·', classes: ['is-future'], title: tip('unchecked') };
        }
        return p.error
          ? { text: '≠', classes: ['is-check-bad'], title: tip('error') }
          : { text: '=', classes: ['is-check-ok'], title: '' };

      case 'key':
        if (!p.inKey) {
          return emptyCell();
        }
        return ctx.accepted
          ? { text: String(p.aliceBit), classes: ['is-key'], title: '' }
          : { text: String(p.aliceBit), classes: ['is-discarded'], title: tip('discarded') };

      default:
        throw new Error('Unknown table row: ' + rowId);
    }
  }

  /** True if the user's overrides contain a value for this field and photon. */
  function isOverridden(overrides, field, index) {
    return Boolean(overrides && overrides[field] && overrides[field][index] !== undefined);
  }

  /**
   * Builds the whole table as plain data.
   *
   * @param {object} run - The result of protocol.runProtocol().
   * @param {number} step - The current step, 1 to 8.
   * @param {object} [overrides] - The manual edits (same shape as for runProtocol).
   * @returns {{columns: Array<object>, rows: Array<object>}}
   */
  function buildModel(run, step, overrides) {
    const eveEnabled = run.settings.eveEnabled;
    const ctx = { step, accepted: run.decision === DECISION.ACCEPTED };

    // From step 6 on, the columns of discarded photons fade out.
    const isDimmed = (p) => step >= 6 && !p.basesMatch;

    const columns = run.photons.map((p) => ({ number: p.index + 1, dimmed: isDimmed(p) }));

    const rows = ROWS
      .filter((row) => !row.eve || eveEnabled)
      .map((row) => {
        const label = t(`row.${row.id}`);
        const reached = step >= row.step;
        let state = 'done';
        if (row.step === step) {
          state = 'active';
        } else if (!reached) {
          state = 'pending';
        }

        const cells = run.photons.map((p) => {
          const base = reached ? describeCell(row.id, p, ctx) : FUTURE;
          // Copy the class list: FUTURE is shared by many cells and must not change.
          const cell = { text: base.text, classes: [...base.classes], title: base.title, edit: null };
          if (isDimmed(p)) {
            cell.classes.push('is-dimmed');
          }

          // Editable: the row has an edit field, its step is reached, and for
          // Eve's basis only if she actually intercepted this photon.
          const canEdit = reached && row.edit && (row.edit !== 'eveBasis' || p.intercepted);
          if (canEdit) {
            const current = p[row.edit];
            const value = nextValue(row.edit, current);
            cell.edit = {
              field: row.edit,
              index: p.index,
              value,
              label: t('table.editLabel', {
                photon: p.index + 1,
                row: label,
                current: valueText(row.edit, current),
                next: valueText(row.edit, value)
              })
            };
            if (isOverridden(overrides, row.edit, p.index)) {
              cell.classes.push('is-edited');
            }
          }
          return cell;
        });

        return { id: row.id, label, actor: t(`actor.${row.actor}`), editable: Boolean(row.edit), state, cells };
      });

    return { columns, rows };
  }

  // ---------------------------------------------------------------------------
  // View: DOM rendering
  // ---------------------------------------------------------------------------

  /**
   * Draws the protocol table into an existing <table> element.
   *
   * Usage (in app.js):
   *   const table = new ProtocolTable(document.getElementById('protocol-table'), onEdit);
   *   table.render(run, step, overrides);   // after every change
   */
  class ProtocolTable {
    /**
     * @param {HTMLTableElement} tableElement - A <table> with an empty <thead> and <tbody>.
     * @param {function({field: string, index: number, value: *}): void} onEdit -
     *   Called when the user clicks an editable cell, with the requested new value.
     */
    constructor(tableElement, onEdit) {
      this.table = tableElement;
      this.thead = tableElement.tHead;
      this.tbody = tableElement.tBodies[0];
      this.onEdit = onEdit;

      // One listener for the whole table ("event delegation"). It keeps
      // working after render() replaces every cell, because the table stays.
      this.table.addEventListener('click', (event) => this.handleClick(event));
    }

    /**
     * Redraws the table.
     *
     * @param {object} run - The result of protocol.runProtocol().
     * @param {number} step - The current step, 1 to 8.
     * @param {object} [overrides] - The manual edits, used to mark edited cells.
     */
    render(run, step, overrides) {
      const model = buildModel(run, step, overrides);
      const focused = this.focusedCell();

      this.thead.replaceChildren(this.createHeaderRow(model.columns));
      this.tbody.replaceChildren(...model.rows.map((row) => this.createRow(row)));

      this.restoreFocus(focused);
    }

    /** The first row: an empty corner cell and the photon numbers. */
    createHeaderRow(columns) {
      const tr = el('tr');
      const corner = el('td', 'corner');
      corner.setAttribute('aria-hidden', 'true');
      tr.append(corner);
      for (const column of columns) {
        const th = el('th', column.dimmed ? 'is-dimmed' : '', String(column.number));
        th.scope = 'col';
        tr.append(th);
      }
      return tr;
    }

    /** One protocol row: a row header and one cell per photon. */
    createRow(row) {
      const tr = el('tr', row.state === 'active' ? 'is-active' : row.state === 'pending' ? 'is-pending' : '');

      const th = el('th');
      th.scope = 'row';
      const label = el('span', 'row-label', row.label);
      if (row.editable) {
        const icon = el('span', 'row-edit-icon', '✎');
        icon.setAttribute('aria-hidden', 'true');
        label.append(icon, el('span', 'sr-only', t('table.editable')));
      }
      th.append(label, el('span', 'row-actor', row.actor));
      tr.append(th);

      for (const cell of row.cells) {
        tr.append(this.createCell(cell));
      }
      return tr;
    }

    /** One cell: plain text, or a button when the cell is editable. */
    createCell(cell) {
      const td = el('td', cell.classes.join(' '));
      if (!cell.edit) {
        td.textContent = cell.text;
        if (cell.title) {
          td.title = cell.title;
        }
        return td;
      }

      const button = el('button', '', cell.text);
      button.type = 'button';
      button.dataset.field = cell.edit.field;
      button.dataset.index = String(cell.edit.index);
      button.dataset.value = String(cell.edit.value);
      button.setAttribute('aria-label', cell.edit.label);
      button.title = cell.edit.label;
      td.append(button);
      return td;
    }

    /** Turns a click on an editable cell into an edit request for app.js. */
    handleClick(event) {
      const button = event.target.closest('button[data-field]');
      if (!button || !this.table.contains(button)) {
        return;
      }
      const field = button.dataset.field;
      const raw = button.dataset.value;
      this.onEdit({
        field,
        index: Number(button.dataset.index),
        value: field === 'aliceBit' ? Number(raw) : raw
      });
    }

    /**
     * Remembers which editable cell has keyboard focus before a redraw,
     * because render() replaces every element and the focus would be lost.
     */
    focusedCell() {
      const active = document.activeElement;
      if (active && this.table.contains(active) && active.dataset.field) {
        return { field: active.dataset.field, index: active.dataset.index };
      }
      return null;
    }

    /** Puts the keyboard focus back on the same cell after a redraw. */
    restoreFocus(focused) {
      if (!focused) {
        return;
      }
      const button = this.table.querySelector(
        `button[data-field="${focused.field}"][data-index="${focused.index}"]`
      );
      if (button) {
        button.focus();
      }
    }
  }

  const api = { ROWS, nextValue, describeCell, buildModel, ProtocolTable };

  if (isNode) {
    module.exports = api;
  } else {
    global.BB84.ui = global.BB84.ui || {};
    global.BB84.ui.table = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);