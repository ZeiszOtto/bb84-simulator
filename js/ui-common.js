/**
 * ui-common.js — Small helpers shared by the UI scripts (ui-table.js,
 * ui-channel.js and app.js): finding and creating elements, and formatting
 * values for display. Texts in words live in i18n.js.
 *
 * Works as a classic browser script and as a Node.js module for the tests.
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

  const api = { byId, el, percent, basisText, photonGlyph };

  if (isNode) {
    module.exports = api;
  } else {
    global.BB84.ui = global.BB84.ui || {};
    global.BB84.ui.common = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);