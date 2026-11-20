/**
 * app.js — Connects everything: owns the application state, listens to the
 * controls, runs the protocol and updates every part of the page.
 *
 * Data flows one way:
 *
 *   user action ──▶ change `state` ──▶ render() ──▶ runProtocol() ──▶ update the page
 *
 * Every handler only changes `state` and then calls render().
 * render() recomputes the run from the state and redraws everything,
 * so the page can never get out of sync with the state.
 */
(function (global) {
  'use strict';

  const BB84 = global.BB84 || {};
  const { protocol, rng, i18n } = BB84;
  const ui = BB84.ui || {};
  if (!protocol || !rng || !i18n || !ui.common || !ui.table || !ui.channel) {
    throw new Error('app.js: load rng.js, protocol.js, i18n.js, ui-common.js, ui-table.js and ui-channel.js before app.js');
  }
  const { DECISION } = protocol;
  const { t } = i18n;
  const { byId, el, percent } = ui.common;

  const LAST_STEP = 8;
  const EVE_STEP = 3;

  /** Name of a step, e.g. stepTitle(6). The texts are in i18n.js under 'step.1' ... 'step.8'. */
  function stepTitle(n) {
    return t(`step.${n}`);
  }

  // ---------------------------------------------------------------------------
  // Texts of the decision
  // ---------------------------------------------------------------------------

  /** Title and explanation of the decision of a run. */
  function decisionInfo(run) {
    const values = {
      qber: run.qber === null ? '' : percent(run.qber),
      threshold: Math.round(run.settings.threshold * 100),
      keyLength: run.keyIndices.length
    };
    switch (run.decision) {
      case DECISION.ACCEPTED:
        return { title: t('decision.acceptedTitle'), text: t('decision.accepted', values) };
      case DECISION.ABORTED:
        return { title: t('decision.abortedTitle'), text: t('decision.aborted', values) };
      default:
        return {
          title: t('decision.insufficientTitle'),
          text: run.qber === null ? t('decision.noSample') : t('decision.noKey')
        };
    }
  }

  // ---------------------------------------------------------------------------
  // Elements
  // ---------------------------------------------------------------------------

  let els = null;   // filled in by init()

  function findElements() {
    return {
      photons: byId('photons'),
      photonsOut: byId('photons-out'),
      eveEnabled: byId('eve-enabled'),
      eveRateField: byId('eve-rate-field'),
      eveRate: byId('eve-rate'),
      eveRateOut: byId('eve-rate-out'),
      threshold: byId('threshold'),
      thresholdOut: byId('threshold-out'),
      seed: byId('seed'),
      seedRandom: byId('seed-random'),
      stepPrev: byId('step-prev'),
      stepNext: byId('step-next'),
      stepList: byId('step-list'),
      stepStatus: byId('step-status'),
      metricSifted: byId('metric-sifted'),
      metricSampled: byId('metric-sampled'),
      metricSampleErrors: byId('metric-sample-errors'),
      metricKey: byId('metric-key'),
      qber: byId('qber'),
      qberValue: byId('qber-value'),
      qberThresholdLabel: byId('qber-threshold-label'),
      protocolTable: byId('protocol-table'),
      tableMeta: byId('table-meta'),
      resetEdits: byId('reset-edits'),
      keyPending: byId('key-pending'),
      keyFinal: byId('key-final'),
      keyAlice: byId('key-alice'),
      keyBob: byId('key-bob'),
      keyNote: byId('key-note'),
      decision: byId('decision'),
      decisionTitle: byId('decision-title'),
      decisionText: byId('decision-text'),
      langSwitch: byId('lang-switch')
    };
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const state = {
    settings: { ...protocol.DEFAULTS },
    step: 1,
    overrides: {},     // manual edits: { field: { photonIndex: value } }
    run: null          // the latest protocol run, kept for debugging
  };

  let table = null;    // ProtocolTable from ui-table.js
  let channel = null;  // ChannelView from ui-channel.js

  /** Reads the settings from the controls, e.g. values the browser restored after a reload. */
  function readSettingsFromControls() {
    state.settings.photons = Number(els.photons.value);
    state.settings.eveEnabled = els.eveEnabled.checked;
    state.settings.eveRate = Number(els.eveRate.value) / 100;
    state.settings.threshold = Number(els.threshold.value) / 100;
    state.settings.seed = els.seed.value.trim();
  }

  function hasOverrides() {
    return Object.values(state.overrides).some((map) => Object.keys(map).length > 0);
  }

  /** Copy of the overrides without one entry. */
  function overridesWithout(field, index) {
    const copy = {};
    for (const [key, map] of Object.entries(state.overrides)) {
      copy[key] = { ...map };
    }
    if (copy[field]) {
      delete copy[field][index];
    }
    return copy;
  }

  /**
   * Stores a manual edit. If the new value equals what the run would give
   * without the edit, the edit is removed, so cells changed back are no
   * longer marked as edited.
   */
  function setOverride(field, index, value) {
    const without = overridesWithout(field, index);
    const original = protocol.runProtocol(state.settings, without).photons[index][field];
    if (value === original) {
      state.overrides = without;
    } else {
      state.overrides = { ...state.overrides, [field]: { ...without[field], [index]: value } };
    }
  }

  // ---------------------------------------------------------------------------
  // Steps
  // ---------------------------------------------------------------------------

  /** Step 3 belongs to Eve and is skipped when she is switched off. */
  function isSkipped(step) {
    return step === EVE_STEP && !state.settings.eveEnabled;
  }

  function nextStep(step) {
    let n = Math.min(LAST_STEP, step + 1);
    if (isSkipped(n)) {
      n += 1;
    }
    return n;
  }

  function previousStep(step) {
    let n = Math.max(1, step - 1);
    if (isSkipped(n)) {
      n -= 1;
    }
    return n;
  }

  /** Moves to a step, unless it does not exist or is skipped. */
  function goTo(step) {
    if (step >= 1 && step <= LAST_STEP && !isSkipped(step)) {
      state.step = step;
    }
    render();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /** Recomputes the run from the state and updates the whole page. */
  function render() {
    const run = protocol.runProtocol(state.settings, state.overrides);
    state.run = run;

    renderLangSwitch();
    renderSteps();
    renderResults(run);
    channel.render(run, state.step);
    table.render(run, state.step, state.overrides);
    renderKey(run);

    els.tableMeta.textContent = t('table.meta', { seed: run.settings.seed, count: run.photons.length });
    els.resetEdits.hidden = !hasOverrides();
  }

  /** Marks the button of the current language as pressed. */
  function renderLangSwitch() {
    for (const button of els.langSwitch.querySelectorAll('button[data-lang]')) {
      button.setAttribute('aria-pressed', String(button.dataset.lang === i18n.getLang()));
    }
  }

  /** The step list (current, done and skipped steps) and the Previous / Next buttons. */
  function renderSteps() {
    els.stepPrev.disabled = previousStep(state.step) === state.step;
    els.stepNext.disabled = state.step === LAST_STEP;

    for (const button of els.stepList.querySelectorAll('button[data-step]')) {
      const n = Number(button.dataset.step);
      const skipped = isSkipped(n);
      const label = skipped ? t('steps.skipped') : stepTitle(n);
      button.replaceChildren(el('span', 'step-num', String(n)), document.createTextNode(label));

      button.classList.toggle('is-done', n < state.step && !skipped);
      button.classList.toggle('is-skipped', skipped);
      if (n === state.step) {
        button.setAttribute('aria-current', 'step');
      } else {
        button.removeAttribute('aria-current');
      }
      if (skipped) {
        button.setAttribute('aria-disabled', 'true');
        button.title = t('steps.skippedHint');
      } else {
        button.removeAttribute('aria-disabled');
        button.removeAttribute('title');
      }
    }

    // Read out by screen readers; the soft hyphen is removed for them.
    els.stepStatus.textContent = t('steps.status', { step: state.step, title: stepTitle(state.step).replace('\u00AD', '') });
  }

  /** Writes a value into a result field, with an optional ok/bad color. */
  function setMetric(element, text, tone) {
    element.textContent = text;
    element.classList.toggle('is-ok', tone === 'ok');
    element.classList.toggle('is-bad', tone === 'bad');
  }

  function renderResults(run) {
    const step = state.step;
    const n = run.photons.length;

    setMetric(els.metricSifted, step >= 6 ? `${run.siftedIndices.length} / ${n}` : '–');
    setMetric(els.metricSampled, step >= 7 ? String(run.sampleIndices.length) : '–');
    setMetric(els.metricSampleErrors, step >= 7 ? String(run.sampleErrors) : '–',
      step >= 7 && run.sampleErrors > 0 ? 'bad' : null);

    if (step >= LAST_STEP) {
      if (run.decision === DECISION.ACCEPTED) {
        setMetric(els.metricKey, t('results.keyBits', { count: run.keyIndices.length }), 'ok');
      } else {
        setMetric(els.metricKey, run.decision === DECISION.ABORTED ? t('results.discarded') : t('results.none'), 'bad');
      }
    } else {
      setMetric(els.metricKey, '–');
    }

    // The QBER bar: CSS draws it from two numbers (see style.css, section 8).
    els.qber.style.setProperty('--threshold', String(run.settings.threshold));
    els.qberThresholdLabel.textContent = t('results.thresholdLabel', { value: percent(run.settings.threshold) });
    if (step >= 7 && run.qber !== null) {
      els.qber.style.setProperty('--qber', String(run.qber));
      els.qber.dataset.state = run.qber >= run.settings.threshold ? 'over' : 'ok';
      els.qberValue.textContent = percent(run.qber);
    } else {
      els.qber.style.setProperty('--qber', '0');
      delete els.qber.dataset.state;
      els.qberValue.textContent = '–';
    }
  }

  function renderKey(run) {
    const final = state.step >= LAST_STEP;
    els.keyPending.hidden = final;
    els.keyFinal.hidden = !final;
    if (!final) {
      return;
    }

    const accepted = run.decision === DECISION.ACCEPTED;
    const bitClass = (ok) => {
      if (accepted) {
        return ok ? 'key-bit is-ok' : 'key-bit is-error';
      }
      return ok ? 'key-bit is-discarded' : 'key-bit is-discarded is-error';
    };

    if (run.keyIndices.length === 0) {
      els.keyAlice.replaceChildren(el('span', 'hint', t('key.noBits')));
      els.keyBob.replaceChildren(el('span', 'hint', t('key.noBits')));
    } else {
      els.keyAlice.replaceChildren(...run.keyIndices.map((i) => el('span', bitClass(true), String(run.photons[i].aliceBit))));
      els.keyBob.replaceChildren(...run.keyIndices.map((i) => {
        const p = run.photons[i];
        return el('span', bitClass(!p.error), String(p.bobBit));
      }));
    }

    // Errors the sample did not find stay in the key.
    const hidden = run.keyIndices.filter((i) => run.photons[i].error);
    els.keyNote.hidden = hidden.length === 0;
    if (hidden.length > 0) {
      els.keyNote.textContent = t('key.hiddenErrors', { photons: hidden.map((i) => i + 1) });
    }

    const info = decisionInfo(run);
    els.decision.dataset.decision = run.decision;
    els.decisionTitle.textContent = info.title;
    els.decisionText.textContent = info.text;
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /** The rate slider only works while Eve is switched on. */
  function updateEveRateField() {
    const on = state.settings.eveEnabled;
    els.eveRate.disabled = !on;
    els.eveRateField.classList.toggle('is-disabled', !on);
  }

  function bindEvents() {
    // Settings. 'input' fires continuously while a slider is dragged.
    els.photons.addEventListener('input', () => {
      state.settings.photons = Number(els.photons.value);
      els.photonsOut.textContent = els.photons.value;
      render();
    });

    els.eveEnabled.addEventListener('change', () => {
      state.settings.eveEnabled = els.eveEnabled.checked;
      updateEveRateField();
      if (isSkipped(state.step)) {
        state.step = nextStep(state.step - 1);
      }
      render();
    });

    els.eveRate.addEventListener('input', () => {
      state.settings.eveRate = Number(els.eveRate.value) / 100;
      els.eveRateOut.textContent = `${els.eveRate.value}%`;
      render();
    });

    els.threshold.addEventListener('input', () => {
      state.settings.threshold = Number(els.threshold.value) / 100;
      els.thresholdOut.textContent = `${els.threshold.value}%`;
      render();
    });

    // A new seed means new random values, so old manual edits no longer apply.
    els.seed.addEventListener('input', () => {
      state.settings.seed = els.seed.value.trim();
      state.overrides = {};
      render();
    });

    els.seedRandom.addEventListener('click', () => {
      const seed = rng.randomSeed();
      els.seed.value = seed;
      state.settings.seed = seed;
      state.overrides = {};
      render();
    });

    els.resetEdits.addEventListener('click', () => {
      state.overrides = {};
      render();
    });

    // Language: rewrite the static texts of the page, then redraw the rest.
    els.langSwitch.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-lang]');
      if (button) {
        i18n.setLang(button.dataset.lang, true);
        i18n.translatePage(document);
        render();
      }
    });

    // Stepping
    els.stepPrev.addEventListener('click', () => goTo(previousStep(state.step)));
    els.stepNext.addEventListener('click', () => goTo(nextStep(state.step)));

    els.stepList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-step]');
      if (button) {
        goTo(Number(button.dataset.step));
      }
    });

    // Keyboard: left and right arrows step back and forth, except while typing
    // or adjusting a slider (where the arrows already have a meaning).
    document.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (event.target.closest('input, textarea, select')) {
        return;
      }
      if (event.key === 'ArrowRight') {
        goTo(nextStep(state.step));
        event.preventDefault();
      } else if (event.key === 'ArrowLeft') {
        goTo(previousStep(state.step));
        event.preventDefault();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  function init() {
    i18n.setLang(i18n.detectLang());
    i18n.translatePage(document);

    els = findElements();
    readSettingsFromControls();
    updateEveRateField();

    table = new ui.table.ProtocolTable(els.protocolTable, (edit) => {
      setOverride(edit.field, edit.index, edit.value);
      render();
    });
    channel = new ui.channel.ChannelView();

    bindEvents();
    render();

    // Handy for debugging in the browser console: BB84.app.state, BB84.app.goTo(5)
    BB84.app = { state, render, goTo };
  }

  global.BB84 = BB84;
  init();
})(typeof globalThis !== 'undefined' ? globalThis : this);