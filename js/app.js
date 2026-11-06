/**
 * app.js — Connects everything: owns the application state, listens to the
 * controls, runs the protocol and updates every part of the page.
 *
 * Data flows one way:
 *
 *   user action ──▶ change `state` ──▶ render() ──▶ runProtocol() ──▶ update the page
 *
 * Every handler only changes `state` and then calls render(). render()
 * recomputes the run from the state and redraws everything, so the page
 * can never get out of sync with the state.
 *
 * Optional modules: the channel animation (ui-channel.js) and the statistics
 * view (stats.js) are used when they are loaded; the page still works without them.
 *
 * Must be loaded last (see index.html).
 */
(function (global) {
  'use strict';

  const BB84 = global.BB84 || {};
  const { protocol, rng } = BB84;
  const tableModule = BB84.ui && BB84.ui.table;
  if (!protocol || !rng || !tableModule) {
    throw new Error('app.js: load rng.js, protocol.js and ui-table.js before app.js');
  }
  const { DECISION } = protocol;

  const LAST_STEP = 8;
  const EVE_STEP = 3;
  const PLAY_INTERVAL_MS = 1600;

  // ---------------------------------------------------------------------------
  // Texts of the 8 steps
  // ---------------------------------------------------------------------------

  /** "33%" from 0.333... */
  function percent(fraction) {
    return `${Math.round(fraction * 100)}%`;
  }

  /** "3." / "3. és 7." / "2., 3. és 7." from [2, 6] (0-based indices). */
  function photonList(indices) {
    const names = indices.map((i) => `${i + 1}.`);
    if (names.length <= 1) {
      return names.join('');
    }
    return `${names.slice(0, -1).join(', ')} és ${names[names.length - 1]}`;
  }

  /**
   * The steps of the protocol. `list` is the label in the step list (with a
   * soft hyphen, ­, so the long word can break), `text` explains the step
   * for the current run.
   */
  const STEPS = [
    {
      title: 'Alice bitjei',
      actor: 'Alice',
      text: () => 'Alice minden fotonhoz véletlen bitet sorsol. A ceruzával jelölt sorok celláira ' +
        'kattintva az értékek kézzel is átírhatók, a Véletlen gomb pedig új seedet sorsol.'
    },
    {
      title: 'Alice bázisai',
      actor: 'Alice',
      text: (run) => (run.settings.fixedBasis
        ? 'Rögzített bázis mód: a protokoll szabálya szerint mindenki mindig + bázist használ. Ezt a szabályt Eve is ismeri.'
        : 'Alice minden fotonhoz véletlen bázist is választ: + (egyenes) vagy × (átlós). ' +
          'A bit és a bázis együtt adja a foton polarizációját.')
    },
    {
      title: 'Eve mérése',
      actor: 'Eve',
      text: (run) => {
        const intercepted = run.photons.filter((p) => p.intercepted).length;
        const wrong = run.photons.filter((p) => p.eveRandom).length;
        return 'Eve elfogja a fotonokat, és mindegyiket egy saját, véletlen bázisban megméri. ' +
          'Ahol rossz bázist választott, véletlen eredményt kap, és megváltozott fotont küld tovább ' +
          `Bobnak (piros keret). Elfogott fotonok: ${intercepted} / ${run.photons.length}, ` +
          `ebből rossz bázisban mért: ${wrong}.`;
      }
    },
    {
      title: 'Bob bázisai',
      actor: 'Bob',
      text: (run) => (run.settings.fixedBasis
        ? 'Bob is a rögzített + bázisban mér.'
        : 'Bob nem tudja, melyik bázisban küldték a fotonokat, ezért mindegyikhez véletlen mérési bázist választ.')
    },
    {
      title: 'Bob mérése',
      actor: 'Bob',
      text: (run) => (run.settings.eveEnabled
        ? 'Bob megméri a hozzá érkező fotonokat. Ha a bázisa eltér a beérkező foton bázisától, ' +
          'az eredmény véletlen (szaggatott keret).'
        : 'Bob megméri a fotonokat. Ahol a bázisa egyezik Alice bázisával, pontosan Alice bitjét kapja, ' +
          'máshol véletlen eredményt (szaggatott keret).')
    },
    {
      title: 'Bázisegyeztetés',
      list: 'Bázis­egyeztetés',
      actor: 'Nyilvános csatorna',
      text: (run) => 'Alice és Bob nyilvánosan összeveti a bázisokat, a biteket nem. Csak az egyező ' +
        `bázisú pozíciók maradnak meg: ${run.siftedIndices.length} / ${run.photons.length}.` +
        (run.siftedErrors > 0
          ? ' Pirossal jelölve, ahol Bob bitje eltér Alice bitjétől. Ezt csak a szimulátor látja, Alice és Bob még nem tudja.'
          : '')
    },
    {
      title: 'Ellenőrzés',
      actor: 'Nyilvános csatorna',
      text: (run) => {
        const k = run.sampleIndices.length;
        if (k === 0) {
          return 'Túl kevés bit maradt a szűrés után, nincs mit ellenőrizni.';
        }
        return `Alice és Bob a szűrt bitek egy részét (${k} bitet) nyilvánosan összehasonlítja, majd eldobja. ` +
          `Eltérő bitek: ${run.sampleErrors}, a QBER ${percent(run.qber)}.`;
      }
    },
    {
      title: 'Döntés',
      actor: 'Alice és Bob',
      text: (run) => decisionInfo(run).text
    }
  ];

  /** Title and explanation of the decision of a run. */
  function decisionInfo(run) {
    const threshold = percent(run.settings.threshold);
    switch (run.decision) {
      case DECISION.ACCEPTED:
        return {
          title: 'Kulcs elfogadva',
          text: `A QBER (${percent(run.qber)}) a ${threshold}-os küszöb alatt van. ` +
            `A maradék ${run.keyIndices.length} bit lesz a közös titkos kulcs.`
        };
      case DECISION.ABORTED:
        return {
          title: 'Lehallgatás gyanúja: a kulcsot eldobták',
          text: `A QBER (${percent(run.qber)}) eléri vagy meghaladja a ${threshold}-os küszöböt, ` +
            'ezért lehallgatásra kell gyanakodni. A kulcsot eldobják, és újrakezdik a protokollt.'
        };
      default:
        return {
          title: 'Kevés a bit a döntéshez',
          text: run.qber === null
            ? 'Egyetlen bit sem került a mintába, így a hibaarány nem becsülhető. Növeld a fotonok számát.'
            : 'Az ellenőrzés után nem maradt bit a kulcshoz. Növeld a fotonok számát.'
        };
    }
  }

  // ---------------------------------------------------------------------------
  // Elements
  // ---------------------------------------------------------------------------

  /** Finds an element by id and fails loudly if index.html does not have it. */
  function byId(id) {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`app.js: missing element #${id} in index.html`);
    }
    return element;
  }

  /** Creates an element with an optional class name and text. */
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

  let els = null;   // filled in by init()

  function findElements() {
    return {
      viewStep: byId('view-step'),
      viewStats: byId('view-stats'),
      viewSwitch: document.querySelector('.view-switch'),
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
      fixedBasis: byId('fixed-basis'),
      resetEdits: byId('reset-edits'),
      metricSifted: byId('metric-sifted'),
      metricSampled: byId('metric-sampled'),
      metricSampleErrors: byId('metric-sample-errors'),
      metricKey: byId('metric-key'),
      qber: document.querySelector('.qber'),
      qberValue: byId('qber-value'),
      qberThresholdLabel: byId('qber-threshold-label'),
      stepNumber: byId('step-number'),
      stepTitle: byId('step-title'),
      stepActor: byId('step-actor'),
      stepText: byId('step-text'),
      stepPrev: byId('step-prev'),
      stepNext: byId('step-next'),
      stepPlay: byId('step-play'),
      stepRestart: byId('step-restart'),
      stepList: byId('step-list'),
      protocolTable: byId('protocol-table'),
      tableMeta: byId('table-meta'),
      keyPending: byId('key-pending'),
      keyFinal: byId('key-final'),
      keyAlice: byId('key-alice'),
      keyBob: byId('key-bob'),
      keyNote: byId('key-note'),
      decision: byId('decision'),
      decisionTitle: byId('decision-title'),
      decisionText: byId('decision-text')
    };
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const state = {
    settings: { ...protocol.DEFAULTS },
    step: 1,
    overrides: {},     // manual edits: { field: { photonIndex: value } }
    view: 'step',      // 'step' or 'stats'
    timer: null,       // interval id while "Lejátszás" is running
    run: null          // the latest protocol run, kept for debugging
  };

  let table = null;    // ProtocolTable instance
  let channel = null;  // optional ChannelView from ui-channel.js
  let stats = null;    // optional StatsView from stats.js

  /** Reads the settings from the controls, e.g. values the browser restored after a reload. */
  function readSettingsFromControls() {
    state.settings.photons = Number(els.photons.value);
    state.settings.eveEnabled = els.eveEnabled.checked;
    state.settings.eveRate = Number(els.eveRate.value) / 100;
    state.settings.threshold = Number(els.threshold.value) / 100;
    state.settings.seed = els.seed.value.trim();
    state.settings.fixedBasis = els.fixedBasis.checked;
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
  // Steps and playback
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

  /** Moves to a step. Manual navigation stops the playback. */
  function goTo(step, { fromPlayback = false } = {}) {
    if (!fromPlayback) {
      stopPlaying();
    }
    if (step >= 1 && step <= LAST_STEP && !isSkipped(step)) {
      state.step = step;
    }
    render();
  }

  function startPlaying() {
    if (state.step >= LAST_STEP) {
      state.step = 1;
    }
    state.timer = setInterval(() => {
      if (state.step >= LAST_STEP) {
        stopPlaying();
        render();
        return;
      }
      goTo(nextStep(state.step), { fromPlayback: true });
    }, PLAY_INTERVAL_MS);
    render();
  }

  function stopPlaying() {
    if (state.timer !== null) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function togglePlaying() {
    if (state.timer !== null) {
      stopPlaying();
      render();
    } else {
      startPlaying();
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /** Recomputes the run from the state and updates the whole step view. */
  function render() {
    const run = protocol.runProtocol(state.settings, state.overrides);
    state.run = run;

    renderStepper(run);
    renderResults(run);
    table.render(run, state.step, state.overrides);
    renderKey(run);
    if (channel) {
      channel.render(run, state.step);
    }

    els.tableMeta.textContent = `seed ${run.settings.seed || '(üres)'} · ${run.photons.length} foton`;
    els.resetEdits.hidden = !hasOverrides();
  }

  function renderStepper(run) {
    const info = STEPS[state.step - 1];
    els.stepNumber.textContent = String(state.step);
    els.stepTitle.textContent = info.title;
    els.stepActor.textContent = info.actor;
    els.stepText.textContent = info.text(run);

    els.stepPrev.disabled = previousStep(state.step) === state.step;
    els.stepNext.disabled = state.step === LAST_STEP;
    els.stepPlay.textContent = state.timer !== null ? 'Szünet' : 'Lejátszás';

    for (const button of els.stepList.querySelectorAll('button[data-step]')) {
      const n = Number(button.dataset.step);
      const skipped = isSkipped(n);
      const label = skipped ? 'Eve · kihagyva' : (STEPS[n - 1].list || STEPS[n - 1].title);
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
        button.title = 'Kapcsold be Eve-et, hogy ez a lépés is látszódjon';
      } else {
        button.removeAttribute('aria-disabled');
        button.removeAttribute('title');
      }
    }
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
        setMetric(els.metricKey, `${run.keyIndices.length} bit`, 'ok');
      } else {
        setMetric(els.metricKey, run.decision === DECISION.ABORTED ? 'eldobva' : 'nincs', 'bad');
      }
    } else {
      setMetric(els.metricKey, '–');
    }

    // The QBER bar: CSS draws it from two numbers (see style.css, section 7).
    els.qber.style.setProperty('--threshold', String(run.settings.threshold));
    els.qberThresholdLabel.textContent = `küszöb ${percent(run.settings.threshold)}`;
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
    const bitClass = (ok) => (accepted ? (ok ? 'key-bit is-ok' : 'key-bit is-error') : (ok ? 'key-bit is-discarded' : 'key-bit is-discarded is-error'));

    if (run.keyIndices.length === 0) {
      els.keyAlice.replaceChildren(el('span', 'hint', 'nincs kulcsbit'));
      els.keyBob.replaceChildren(el('span', 'hint', 'nincs kulcsbit'));
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
      els.keyNote.textContent = `A minta nem talál meg minden hibát: a ${photonList(hidden)} foton hibája ` +
        'a kulcsban maradt. A valódi protokollban ezt hibajavítás kezeli.';
    }

    const info = decisionInfo(run);
    els.decision.dataset.decision = run.decision;
    els.decisionTitle.textContent = info.title;
    els.decisionText.textContent = info.text;
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  function showView(view) {
    stopPlaying();
    state.view = view;
    els.viewStep.hidden = view !== 'step';
    els.viewStats.hidden = view !== 'stats';
    for (const button of els.viewSwitch.querySelectorAll('button[data-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    }
    if (view === 'stats' && stats) {
      stats.show();
    }
    if (view === 'step') {
      render();
    }
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function bindEvents() {
    // Settings. 'input' fires continuously while a slider is dragged.
    els.photons.addEventListener('input', () => {
      state.settings.photons = Number(els.photons.value);
      els.photonsOut.textContent = els.photons.value;
      render();
    });

    els.eveEnabled.addEventListener('change', () => {
      state.settings.eveEnabled = els.eveEnabled.checked;
      els.eveRateField.hidden = !state.settings.eveEnabled;
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

    els.fixedBasis.addEventListener('change', () => {
      state.settings.fixedBasis = els.fixedBasis.checked;
      render();
    });

    els.resetEdits.addEventListener('click', () => {
      state.overrides = {};
      render();
    });

    // Stepper
    els.stepPrev.addEventListener('click', () => goTo(previousStep(state.step)));
    els.stepNext.addEventListener('click', () => goTo(nextStep(state.step)));
    els.stepRestart.addEventListener('click', () => goTo(1));
    els.stepPlay.addEventListener('click', togglePlaying);

    els.stepList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-step]');
      if (button) {
        goTo(Number(button.dataset.step));
      }
    });

    // View switch
    els.viewSwitch.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-view]');
      if (button) {
        showView(button.dataset.view);
      }
    });

    // Keyboard: left and right arrows step back and forth, except while typing
    // or adjusting a slider (where the arrows already have a meaning).
    document.addEventListener('keydown', (event) => {
      if (state.view !== 'step' || event.altKey || event.ctrlKey || event.metaKey) {
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
    els = findElements();
    readSettingsFromControls();
    els.eveRateField.hidden = !state.settings.eveEnabled;

    table = new tableModule.ProtocolTable(els.protocolTable, (edit) => {
      setOverride(edit.field, edit.index, edit.value);
      render();
    });

    const channelModule = BB84.ui && BB84.ui.channel;
    if (channelModule) {
      channel = new channelModule.ChannelView();
    }
    if (BB84.stats && BB84.stats.StatsView) {
      stats = new BB84.stats.StatsView();
    }

    bindEvents();
    render();

    // Handy for debugging in the browser console: BB84.app.state, BB84.app.goTo(5)
    BB84.app = { state, render, goTo };
  }

  global.BB84 = BB84;
  init();
})(typeof globalThis !== 'undefined' ? globalThis : this);