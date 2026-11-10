/**
 * ui-common.js — Small helpers shared by the UI scripts (ui-table.js,
 * ui-channel.js and app.js): finding and creating elements, and formatting
 * values for display.
 *
 * Works as a classic browser script (exposes window.BB84.ui.common;
 * protocol.js must be loaded first) and as a Node.js module for the tests.
 * The element helpers need a browser; the formatting helpers work anywhere.
 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const protocol = isNode ? require('./protocol.js') : (global.BB84 && global.BB84.protocol);
  if (!protocol) {
    throw new Error('ui-common.js: load protocol.js before ui-common.js');
  }
  const { BASIS } = protocol;

  // ---------------------------------------------------------------------------
  // Elements
  // ---------------------------------------------------------------------------

  /** Finds an element by id and fails loudly if index.html does not have it. */
  function byId(id) {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`missing element #${id} in index.html`);
    }
    return element;
  }

  /**
   * Creates an element with an optional class name and text. The text is set
   * with textContent, so it is never interpreted as HTML.
   */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== '') {
      node.textContent = text;
    }
    return node;
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  /** "33%" from 0.333... */
  function percent(fraction) {
    return `${Math.round(fraction * 100)}%`;
  }

  /**
   * The Hungarian definite article for a number: "az" when the number is
   * spoken with a leading vowel (egy, öt, ötven..., ötszáz...), "a" otherwise.
   * Covers 0–999, which is more than the simulator ever shows.
   */
  function article(n) {
    const k = Math.abs(Math.trunc(n));
    const vowel = k === 1 || k === 5 || (k >= 50 && k <= 59) || (k >= 500 && k <= 599);
    return vowel ? 'az' : 'a';
  }

  /**
   * A list of photons with the article in front, from 0-based indices:
   *   [2]       -> "a 3."
   *   [0, 2]    -> "az 1. és 3."
   *   [1, 2, 6] -> "a 2., 3. és 7."
   */
  function photonList(indices) {
    if (indices.length === 0) {
      return '';
    }
    const names = indices.map((i) => `${i + 1}.`);
    const list = names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} és ${names[names.length - 1]}`;
    return `${article(indices[0] + 1)} ${list}`;
  }

  /** How a basis is shown on screen: '+' or '×'. */
  function basisText(basis) {
    return basis === BASIS.RECTILINEAR ? '+' : '×';
  }

  /** The symbol of a polarized photon: — (0°), | (90°), / (45°), \ (135°). */
  function photonGlyph(basis, bit) {
    if (basis === BASIS.RECTILINEAR) {
      return bit ? '|' : '—';
    }
    return bit ? '\\' : '/';
  }

  const api = { byId, el, percent, article, photonList, basisText, photonGlyph };

  if (isNode) {
    module.exports = api;
  } else {
    global.BB84.ui = global.BB84.ui || {};
    global.BB84.ui.common = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);