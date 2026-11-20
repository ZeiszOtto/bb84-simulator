/**
 * ui-channel.js — The "Csatornák" section: which party works in the current
 * step, the photons travelling on the quantum channel, and what is said on
 * the public channel.
 *
 *   Alice ──[ photons ]──▶ (Eve ──[ photons ]──▶) Bob
 *   Nyilvános csatorna: what Alice and Bob announce (steps 6–8)
 *
 * Two layers, like ui-table.js:
 *   1. Model (pure, testable in Node): describeChannel(run, step)
 *   2. View (browser only): ChannelView.render(run, step)
 *
 * Every photon of the run is shown as a small chip with its polarization
 * symbol. When a step sends photons, the chips slide in one after another.
 */
(function (global) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const protocol = isNode ? require('./protocol.js') : (global.BB84 && global.BB84.protocol);
  const i18n = isNode ? require('./i18n.js') : (global.BB84 && global.BB84.i18n);
  const common = isNode ? require('./ui-common.js') : (global.BB84 && global.BB84.ui && global.BB84.ui.common);
  if (!protocol || !i18n || !common) {
    throw new Error('ui-channel.js: load protocol.js, i18n.js and ui-common.js before ui-channel.js');
  }
  const { BASIS, DECISION } = protocol;
  const { t } = i18n;
  const { byId, el, photonGlyph } = common;

  /** 1-based photon numbers for the texts, from 0-based indices. */
  const numbers = (indices) => indices.map((i) => i + 1);

  // ---------------------------------------------------------------------------
  // Model
  // ---------------------------------------------------------------------------

  /** Who works in a step: Alice (1–2), Eve (3), Bob (4–5), the public channel (6–8). */
  function activeParty(step) {
    if (step <= 2) {
      return 'alice';
    }
    if (step === 3) {
      return 'eve';
    }
    if (step <= 5) {
      return 'bob';
    }
    return 'public';
  }

  /** One photon on a channel. */
  function chip(basis, bit, disturbed) {
    return {
      glyph: photonGlyph(basis, bit),
      basis: basis === BASIS.RECTILINEAR ? 'plus' : 'diag',
      disturbed
    };
  }

  /** What is said on the public channel in a step. */
  function publicText(run, step) {
    if (step < 6) {
      return t('public.quiet');
    }

    if (step === 6) {
      const kept = run.siftedIndices;
      const text = kept.length === 0
        ? t('public.noMatch')
        : t('public.match', { photons: numbers(kept) });
      return run.settings.eveEnabled ? `${text} ${t('public.eveListens')}` : text;
    }

    if (step === 7) {
      return run.sampleIndices.length === 0
        ? t('public.noSample')
        : t('public.sample', { photons: numbers(run.sampleIndices) });
    }

    switch (run.decision) {
      case DECISION.ACCEPTED:
        return t('public.accepted');
      case DECISION.ABORTED:
        return t('public.aborted');
      default:
        return t('public.insufficient');
    }
  }

  /**
   * Describes the whole channel section as plain data.
   *
   * @param {object} run - The result of protocol.runProtocol().
   * @param {number} step - The current step, 1 to 8.
   */
  function describeChannel(run, step) {
    const eve = run.settings.eveEnabled;
    const n = run.photons.length;

    // First link: Alice's photons, from step 2 (when Alice has chosen the bases).
    const sent = step >= 2
      ? run.photons.map((p) => chip(p.aliceBasis, p.aliceBit, false))
      : [];

    // Second link (only with Eve): what reaches Bob, from step 3. A photon Eve
    // did not intercept passes on unchanged.
    const arriving = eve && step >= 3
      ? run.photons.map((p) => (p.intercepted ? chip(p.eveBasis, p.eveBit, p.eveRandom) : chip(p.aliceBasis, p.aliceBit, false)))
      : [];
    const changed = run.photons.filter((p) => p.eveRandom).length;

    let secondCaption = t('channel.notResent');
    if (step >= 3) {
      secondCaption = changed > 0 ? t('channel.changed', { count: changed }) : t('channel.unchanged');
    }

    return {
      active: activeParty(step),
      showEve: eve,
      firstLink: {
        chips: sent,
        caption: step >= 2 ? t('channel.onTheWay', { count: n, target: eve ? 'Eve' : 'Bob' }) : t('channel.notSent')
      },
      secondLink: { chips: arriving, caption: secondCaption },
      publicActive: step >= 6,
      publicText: publicText(run, step)
    };
  }

  // ---------------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------------

  /**
   * Draws the channel section. It finds its elements by id (see index.html).
   *
   * Usage (in app.js):
   *   const channel = new ChannelView();
   *   channel.render(run, step);   // after every change
   */
  class ChannelView {
    constructor() {
      this.nodes = { alice: byId('node-alice'), eve: byId('node-eve'), bob: byId('node-bob') };
      this.eveLink = byId('link-eve-bob');
      this.tracks = [byId('track-1'), byId('track-2')];
      this.captions = [byId('track-1-caption'), byId('track-2-caption')];
      this.publicChannel = byId('public-channel');
      this.publicText = byId('public-text');
      this.lastStep = null;
    }

    render(run, step) {
      const model = describeChannel(run, step);

      // Photons slide in only when the step that sends them is entered,
      // not on every redraw (e.g. while a slider is dragged).
      const entering = step !== this.lastStep;
      this.lastStep = step;

      this.nodes.eve.hidden = !model.showEve;
      this.eveLink.hidden = !model.showEve;
      for (const [name, node] of Object.entries(this.nodes)) {
        node.classList.toggle('is-active', model.active === name);
      }

      this.fillTrack(this.tracks[0], model.firstLink.chips, entering && step === 2);
      this.captions[0].textContent = model.firstLink.caption;
      this.fillTrack(this.tracks[1], model.secondLink.chips, entering && step === 3);
      this.captions[1].textContent = model.secondLink.caption;

      this.publicChannel.classList.toggle('is-active', model.publicActive);
      this.publicText.textContent = model.publicText;
    }

    /** Replaces the chips of one link. --i delays each chip a little more. */
    fillTrack(track, chips, animate) {
      track.replaceChildren(...chips.map((c, i) => {
        let className = `photon-chip ${c.basis}`;
        if (c.disturbed) {
          className += ' is-disturbed';
        }
        if (animate) {
          className += ' is-entering';
        }
        const span = el('span', className, c.glyph);
        span.style.setProperty('--i', String(i));
        return span;
      }));
    }
  }

  const api = { activeParty, publicText, describeChannel, ChannelView };

  if (isNode) {
    module.exports = api;
  } else {
    global.BB84.ui = global.BB84.ui || {};
    global.BB84.ui.channel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);