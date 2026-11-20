/**
 * i18n.js — The texts of the user interface, in Hungarian and English.
 *
 * Every text has a key, e.g. 'header.title'. t(key) returns it in the
 * current language. A text that contains values is a function of named
 * parameters, e.g. t('table.meta', { seed: '1150', count: 12 }). Inside such
 * a function each language can follow its own grammar: Hungarian puts an
 * article in front of numbers ("az 1. és 3. foton"), English needs plurals
 * ("photons 1 and 3").
 *
 * Static texts in index.html are marked with attributes, and
 * translatePage() fills them in:
 *   data-i18n="key"        the element's text (use it on elements without children)
 *   data-i18n-label="key"  its aria-label
 *   data-i18n-title="key"  its title (tooltip)
 *
 * The starting language comes from, in this order: the ?lang= URL
 * parameter, the viewer's last choice, then the browser's language.
 *
 * Works as a classic browser script and as a Node.js module for the tests.
 */
(function (global) {
  'use strict';

  const LANGS = Object.freeze(['hu', 'en']);
  const SOURCE = 'hu';             // the language every text is written in first
  const STORAGE_KEY = 'bb84-lang';
  const isBrowser = typeof document !== 'undefined';

  // ---------------------------------------------------------------------------
  // Grammar helpers for the texts below
  // ---------------------------------------------------------------------------

  /**
   * The Hungarian definite article for a number: "az" when the number is
   * spoken with a leading vowel (egy, öt, ötven..., ötszáz...), "a" otherwise.
   * Covers 0–999, which is more than the simulator ever shows.
   */
  function huArticle(n) {
    const k = Math.abs(Math.trunc(n));
    const vowel = k === 1 || k === 5 || (k >= 50 && k <= 59) || (k >= 500 && k <= 599);
    return vowel ? 'az' : 'a';
  }

  /** "1, 2 and 3" in English, "1., 2. és 3." in Hungarian (ordinals). */
  function joinList(items, and) {
    if (items.length <= 1) {
      return items.join('');
    }
    return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
  }

  /**
   * Photon numbers (1-based) with the Hungarian article in front:
   *   [3] -> "a 3."   [1, 3] -> "az 1. és 3."   [2, 3, 7] -> "a 2., 3. és 7."
   * The sentence adds the word "foton" with its suffix after the list.
   */
  function huPhotons(numbers) {
    if (numbers.length === 0) {
      return '';
    }
    return `${huArticle(numbers[0])} ${joinList(numbers.map((n) => `${n}.`), 'és')}`;
  }

  /** Photon numbers (1-based) in English: "photon 3", "photons 1 and 3", "photons 2, 3 and 7". */
  function enPhotons(numbers) {
    if (numbers.length === 0) {
      return '';
    }
    return `${numbers.length === 1 ? 'photon' : 'photons'} ${joinList(numbers.map(String), 'and')}`;
  }

  /** "1 bit", "3 bits" (English plural). */
  function enCount(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  // ---------------------------------------------------------------------------
  // Texts
  // ---------------------------------------------------------------------------

  const TEXTS = {
    hu: {
      // Page, header, footer
      'page.title': 'BB84 kvantumkulcs-szétosztás szimulátor',
      'page.description': 'Interaktív, léptethető szimuláció a BB84 kvantumkulcs-szétosztási protokollról, lehallgatóval.',
      'header.title': 'BB84 kvantumkulcs-szétosztás szimulátor',
      'header.subtitle': 'Interaktív, léptethető szimuláció lehallgatóval',
      'lang.label': 'Nyelv',
      'footer.text': 'BB84 kvantumkulcs-szétosztás szimulátor · Zeisz Ottó',

      // Settings
      'settings.title': 'Beállítások',
      'settings.photons': 'Fotonok száma',
      'settings.eve': 'Lehallgató (Eve)',
      'settings.eveHint': 'Elfogja, megméri és újraküldi a fotonokat',
      'settings.eveRate': 'Lehallgatási arány',
      'settings.threshold': 'QBER-küszöb',
      'settings.thresholdHint': 'Ha a hibaarány eléri, a kulcsot eldobják',
      'settings.seed': 'Seed',
      'settings.random': 'Véletlen',
      'settings.seedHint': 'Azonos seed mindig azonos futást ad',

      // Steps. The soft hyphen (­) lets the long word break in a narrow button.
      'steps.title': 'A protokoll lépései',
      'steps.navLabel': 'Léptetés',
      'steps.prev': 'Előző',
      'steps.next': 'Következő lépés',
      'step.1': 'Alice bitjei',
      'step.2': 'Alice bázisai',
      'step.3': 'Eve mérése',
      'step.4': 'Bob bázisai',
      'step.5': 'Bob mérése',
      'step.6': 'Bázis­egyeztetés',
      'step.7': 'Ellenőrzés',
      'step.8': 'Döntés',
      'steps.skipped': 'Eve · kihagyva',
      'steps.skippedHint': 'Kapcsold be Eve-et, hogy ez a lépés is látszódjon',
      'steps.status': ({ step, title }) => `${step}. lépés: ${title}`,
      'steps.tip': 'Tipp: a ← és → billentyűkkel is léptethetsz, a lépésekre kattintva pedig bármelyikre ugorhatsz.',

      // Results below the steps
      'results.sifted': 'Szűrt bitek',
      'results.sampled': 'Ellenőrzött bitek',
      'results.sampleErrors': 'Eltérés a mintában',
      'results.key': 'Végső kulcs',
      'results.keyBits': ({ count }) => `${count} bit`,
      'results.discarded': 'eldobva',
      'results.none': 'nincs',
      'results.qber': 'QBER (hibaarány a mintában)',
      'results.thresholdLabel': ({ value }) => `küszöb ${value}`,

      // Channels
      'channel.title': 'Csatornák',
      'channel.sender': 'küldő',
      'channel.eveRole': 'elfog · mér · újraküld',
      'channel.receiver': 'fogadó',
      'channel.notSent': 'A fotonok a 2. lépésben indulnak',
      'channel.onTheWay': ({ count, target }) => `${count} foton úton ${target} felé`,
      'channel.notResent': 'Eve még nem küldött tovább fotont',
      'channel.changed': ({ count }) => `${count} foton megváltozott`,
      'channel.unchanged': 'egyik foton sem változott',
      'channel.public': 'Nyilvános csatorna',
      'public.quiet': 'Még nincs forgalom. A 6. lépéstől itt egyeztetik a bázisokat és az ellenőrző biteket.',
      'public.noMatch': 'Bob bemondja a bázisait, de egyik sem egyezik Alice bázisával.',
      'public.match': ({ photons }) => `Bob bemondja a bázisait, Alice pedig megmondja, hol egyeznek: ${huPhotons(photons)} fotonnál. ` +
        'Biteket nem mondanak ki.',
      'public.eveListens': 'Eve is hallja, de már késő: a fotonokat korábban kellett megmérnie.',
      'public.noSample': 'Nincs ellenőrizhető bit.',
      'public.sample': ({ photons }) => `Összevetik ${huPhotons(photons)} foton bitjét. Ezek a bitek nyilvánossá váltak, ` +
        'ezért kimaradnak a kulcsból.',
      'public.accepted': 'Döntés: a kulcsot elfogadják. A ki nem mondott szűrt bitekből lesz a közös titkos kulcs.',
      'public.aborted': 'Döntés: a kulcsot eldobják, és újrakezdik a protokollt.',
      'public.insufficient': 'Döntés: kevés a bit a döntéshez, újra kell futtatni a protokollt.',

      // Protocol table
      'table.title': 'Protokolltáblázat',
      'table.caption': 'A protokoll lépései fotononként',
      'table.resetEdits': 'Kézi módosítások törlése',
      'table.meta': ({ seed, count }) => `seed ${seed || '(üres)'} · ${count} foton`,
      'row.aliceBit': 'Alice bitje',
      'row.aliceBasis': 'Alice bázisa',
      'row.sent': 'Elküldött foton',
      'row.eveBasis': 'Eve bázisa',
      'row.eveBit': 'Eve mért bitje',
      'row.resent': 'Továbbküldött foton',
      'row.bobBasis': 'Bob bázisa',
      'row.bobBit': 'Bob mért bitje',
      'row.match': 'Bázis egyezik?',
      'row.check': 'Ellenőrzés',
      'row.key': 'Végső kulcs',
      'actor.alice': 'Alice',
      'actor.aliceToChannel': 'Alice → csatorna',
      'actor.eve': 'Eve',
      'actor.eveToBob': 'Eve → Bob',
      'actor.bob': 'Bob',
      'actor.public': 'nyilvános',
      'actor.publicSample': 'nyilvános · minta',
      'actor.aliceBits': 'Alice bitjei',
      'table.editable': ' (kattintással átírható)',
      'table.editLabel': ({ photon, row, current, next }) => `${photon}. foton, ${row}: ${current}. Kattints, hogy ${next} legyen.`,
      'tip.eveRandom': 'Véletlen eredmény: Eve rossz bázisban mért',
      'tip.bobRandom': 'Véletlen eredmény: Bob bázisa eltér a beérkező fotonétól',
      'tip.disturbed': 'Eve megváltoztatta a fotont',
      'tip.error': 'Eltér Alice bitjétől',
      'tip.notIntercepted': 'Eve ezt a fotont nem fogta el',
      'tip.unchecked': 'Nem ellenőrzött bit: a kulcsba kerül',
      'tip.discarded': 'A kulcsot eldobták',
      'legend.plus': 'egyenes bázis: — = 0, | = 1',
      'legend.diag': 'átlós bázis: / = 0, \\ = 1',
      'legend.random': 'véletlen mérési eredmény',
      'legend.disturbed': 'Eve által megváltoztatott foton',
      'legend.error': 'Alice bitjétől eltérő bit',
      'legend.check': 'ellenőrzött bit egyezik / eltér',
      'legend.edit': 'kattintással átírható sor',

      // Key and decision
      'key.title': 'Kulcs és döntés',
      'key.pending': 'A végső kulcs és a döntés a 8. lépésben jelenik meg.',
      'key.alice': 'Alice kulcsa',
      'key.bob': 'Bob kulcsa',
      'key.noBits': 'nincs kulcsbit',
      'key.hiddenErrors': ({ photons }) => `A minta nem talál meg minden hibát: ${huPhotons(photons)} foton hibája ` +
        'a kulcsban maradt. A valódi protokollban ezt hibajavítás kezeli.',
      'decision.acceptedTitle': 'Kulcs elfogadva',
      'decision.accepted': ({ qber, threshold, keyLength }) =>
        `A QBER (${qber}) ${huArticle(threshold)} ${threshold}%-os küszöb alatt van. ` +
        `A maradék ${keyLength} bit lesz a közös titkos kulcs.`,
      'decision.abortedTitle': 'Lehallgatás gyanúja: a kulcsot eldobták',
      'decision.aborted': ({ qber, threshold }) =>
        `A QBER (${qber}) eléri vagy meghaladja ${huArticle(threshold)} ${threshold}%-os küszöböt, ` +
        'ezért lehallgatásra kell gyanakodni. A kulcsot eldobják, és újrakezdik a protokollt.',
      'decision.insufficientTitle': 'Kevés a bit a döntéshez',
      'decision.noSample': 'Egyetlen bit sem került a mintába, így a hibaarány nem becsülhető. Növeld a fotonok számát.',
      'decision.noKey': 'Az ellenőrzés után nem maradt bit a kulcshoz. Növeld a fotonok számát.'
    },

    en: {
      // Page, header, footer
      'page.title': 'BB84 Quantum Key Distribution Simulator',
      'page.description': 'An interactive, step-by-step simulation of the BB84 quantum key distribution protocol, with an eavesdropper.',
      'header.title': 'BB84 quantum key distribution simulator',
      'header.subtitle': 'Interactive, step-by-step simulation with an eavesdropper',
      'lang.label': 'Language',
      'footer.text': 'BB84 quantum key distribution simulator · Ottó Zeisz',

      // Settings
      'settings.title': 'Settings',
      'settings.photons': 'Number of photons',
      'settings.eve': 'Eavesdropper (Eve)',
      'settings.eveHint': 'Intercepts, measures and resends the photons',
      'settings.eveRate': 'Interception rate',
      'settings.threshold': 'QBER threshold',
      'settings.thresholdHint': 'If the error rate reaches it, the key is discarded',
      'settings.seed': 'Seed',
      'settings.random': 'Random',
      'settings.seedHint': 'The same seed always gives the same run',

      // Steps
      'steps.title': 'Protocol steps',
      'steps.navLabel': 'Stepping',
      'steps.prev': 'Previous',
      'steps.next': 'Next step',
      'step.1': 'Alice’s bits',
      'step.2': 'Alice’s bases',
      'step.3': 'Eve’s measurement',
      'step.4': 'Bob’s bases',
      'step.5': 'Bob’s measurement',
      'step.6': 'Basis comparison',
      'step.7': 'Error check',
      'step.8': 'Decision',
      'steps.skipped': 'Eve · skipped',
      'steps.skippedHint': 'Turn Eve on to see this step',
      'steps.status': ({ step, title }) => `Step ${step}: ${title}`,
      'steps.tip': 'Tip: you can also step with the ← and → keys, and jump to any step by clicking it.',

      // Results below the steps
      'results.sifted': 'Sifted bits',
      'results.sampled': 'Checked bits',
      'results.sampleErrors': 'Mismatches in sample',
      'results.key': 'Final key',
      'results.keyBits': ({ count }) => enCount(count, 'bit'),
      'results.discarded': 'discarded',
      'results.none': 'none',
      'results.qber': 'QBER (error rate in the sample)',
      'results.thresholdLabel': ({ value }) => `threshold ${value}`,

      // Channels
      'channel.title': 'Channels',
      'channel.sender': 'sender',
      'channel.eveRole': 'intercepts · measures · resends',
      'channel.receiver': 'receiver',
      'channel.notSent': 'The photons leave in step 2',
      'channel.onTheWay': ({ count, target }) => `${enCount(count, 'photon')} on the way to ${target}`,
      'channel.notResent': 'Eve has not resent any photons yet',
      'channel.changed': ({ count }) => `${enCount(count, 'photon')} changed`,
      'channel.unchanged': 'no photon changed',
      'channel.public': 'Public channel',
      'public.quiet': 'No traffic yet. From step 6, the bases and the check bits are compared here.',
      'public.noMatch': 'Bob announces his bases, but none of them matches Alice’s.',
      'public.match': ({ photons }) => `Bob announces his bases, and Alice tells him where they match: at ${enPhotons(photons)}. ` +
        'No bits are said aloud.',
      'public.eveListens': 'Eve hears this too, but it is too late: she had to measure the photons earlier.',
      'public.noSample': 'There is no bit to check.',
      'public.sample': ({ photons }) => `They compare the bits of ${enPhotons(photons)}. These bits are now public, ` +
        'so they are left out of the key.',
      'public.accepted': 'Decision: the key is accepted. The sifted bits that were not said aloud become the shared secret key.',
      'public.aborted': 'Decision: the key is discarded, and the protocol starts over.',
      'public.insufficient': 'Decision: too few bits to decide; the protocol has to be run again.',

      // Protocol table
      'table.title': 'Protocol table',
      'table.caption': 'The protocol steps, photon by photon',
      'table.resetEdits': 'Clear manual edits',
      'table.meta': ({ seed, count }) => `seed ${seed || '(empty)'} · ${enCount(count, 'photon')}`,
      'row.aliceBit': 'Alice’s bit',
      'row.aliceBasis': 'Alice’s basis',
      'row.sent': 'Photon sent',
      'row.eveBasis': 'Eve’s basis',
      'row.eveBit': 'Eve’s measured bit',
      'row.resent': 'Photon resent',
      'row.bobBasis': 'Bob’s basis',
      'row.bobBit': 'Bob’s measured bit',
      'row.match': 'Bases match?',
      'row.check': 'Check',
      'row.key': 'Final key',
      'actor.alice': 'Alice',
      'actor.aliceToChannel': 'Alice → channel',
      'actor.eve': 'Eve',
      'actor.eveToBob': 'Eve → Bob',
      'actor.bob': 'Bob',
      'actor.public': 'public',
      'actor.publicSample': 'public · sample',
      'actor.aliceBits': 'Alice’s bits',
      'table.editable': ' (click to change)',
      'table.editLabel': ({ photon, row, current, next }) => `Photon ${photon}, ${row}: ${current}. Click to change it to ${next}.`,
      'tip.eveRandom': 'Random result: Eve measured in the wrong basis',
      'tip.bobRandom': 'Random result: Bob’s basis differs from the incoming photon’s',
      'tip.disturbed': 'Eve changed this photon',
      'tip.error': 'Differs from Alice’s bit',
      'tip.notIntercepted': 'Eve did not intercept this photon',
      'tip.unchecked': 'Not checked: this bit goes into the key',
      'tip.discarded': 'The key was discarded',
      'legend.plus': 'rectilinear basis: — = 0, | = 1',
      'legend.diag': 'diagonal basis: / = 0, \\ = 1',
      'legend.random': 'random measurement result',
      'legend.disturbed': 'photon changed by Eve',
      'legend.error': 'bit that differs from Alice’s',
      'legend.check': 'checked bit matches / differs',
      'legend.edit': 'row you can change by clicking',

      // Key and decision
      'key.title': 'Key and decision',
      'key.pending': 'The final key and the decision appear in step 8.',
      'key.alice': 'Alice’s key',
      'key.bob': 'Bob’s key',
      'key.noBits': 'no key bits',
      'key.hiddenErrors': ({ photons }) => `The sample does not catch every error: ${photons.length === 1 ? 'an error' : 'errors'} ` +
        `at ${enPhotons(photons)} stayed in the key. In the real protocol, error correction deals with this.`,
      'decision.acceptedTitle': 'Key accepted',
      'decision.accepted': ({ qber, threshold, keyLength }) =>
        `The QBER (${qber}) is below the ${threshold}% threshold. ` +
        (keyLength === 1
          ? 'The remaining bit becomes the shared secret key.'
          : `The remaining ${keyLength} bits become the shared secret key.`),
      'decision.abortedTitle': 'Eavesdropping suspected: key discarded',
      'decision.aborted': ({ qber, threshold }) =>
        `The QBER (${qber}) reaches or exceeds the ${threshold}% threshold, so eavesdropping must be suspected. ` +
        'The key is discarded, and the protocol starts over.',
      'decision.insufficientTitle': 'Too few bits for a decision',
      'decision.noSample': 'No bit made it into the sample, so the error rate cannot be estimated. Increase the number of photons.',
      'decision.noKey': 'No bits are left for the key after the check. Increase the number of photons.'
    }
  };

  // ---------------------------------------------------------------------------
  // Current language
  // ---------------------------------------------------------------------------

  let current = SOURCE;

  function getLang() {
    return current;
  }

  /**
   * Switches the language. With remember = true the choice is saved, so the
   * next visit starts in it too. Unknown languages are ignored.
   */
  function setLang(lang, remember = false) {
    if (!LANGS.includes(lang)) {
      return;
    }
    current = lang;
    if (remember && isBrowser) {
      try {
        global.localStorage.setItem(STORAGE_KEY, lang);
      } catch (e) {
        // Storage can be blocked; the choice then lasts until the page is reloaded.
      }
    }
  }

  /** The starting language: ?lang=, then the saved choice, then the browser's language. */
  function detectLang() {
    const candidates = [];
    if (isBrowser) {
      try {
        candidates.push(new URLSearchParams(global.location.search).get('lang'));
        candidates.push(global.localStorage.getItem(STORAGE_KEY));
      } catch (e) {
        // Storage can be blocked; fall back to the browser's language.
      }
    }
    const browser = String((global.navigator && global.navigator.language) || '').toLowerCase();
    candidates.push(browser.startsWith('hu') ? 'hu' : 'en');
    return candidates.find((lang) => LANGS.includes(lang));
  }

  // ---------------------------------------------------------------------------
  // Lookup
  // ---------------------------------------------------------------------------

  /**
   * The text of `key` in the current language, or in Hungarian if it has no
   * translation yet. A missing key returns the key itself, so it is easy to spot.
   *
   * @param {string} key
   * @param {object} [params] - Named values for a text that is a function.
   * @returns {string}
   */
  function t(key, params) {
    let entry = TEXTS[current][key];
    if (entry === undefined) {
      entry = TEXTS[SOURCE][key];
    }
    if (entry === undefined) {
      return key;
    }
    return typeof entry === 'function' ? entry(params || {}) : entry;
  }

  /** Writes every static text of the page (see the data-i18n attributes) in the current language. */
  function translatePage(doc) {
    doc.documentElement.lang = current;
    doc.title = t('page.title');
    const description = doc.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute('content', t('page.description'));
    }
    for (const node of doc.querySelectorAll('[data-i18n]')) {
      node.textContent = t(node.dataset.i18n);
    }
    for (const node of doc.querySelectorAll('[data-i18n-label]')) {
      node.setAttribute('aria-label', t(node.dataset.i18nLabel));
    }
    for (const node of doc.querySelectorAll('[data-i18n-title]')) {
      node.title = t(node.dataset.i18nTitle);
    }
  }

  const api = {
    LANGS,
    TEXTS,
    getLang,
    setLang,
    detectLang,
    t,
    translatePage,
    format: { huArticle, huPhotons, enPhotons }   // exported for the tests
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.BB84 = global.BB84 || {};
    global.BB84.i18n = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
