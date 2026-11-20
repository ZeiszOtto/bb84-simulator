/**
 * Tests for js/i18n.js.
 * Run all tests from the project root with:  node --test
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const I = require('../js/i18n.js');

const { huArticle, huPhotons, enPhotons } = I.format;

describe('texts', () => {
  it('has the same keys in every language', () => {
    const keys = (lang) => Object.keys(I.TEXTS[lang]).sort();
    for (const lang of I.LANGS) {
      assert.deepEqual(keys(lang), keys('hu'), `keys of "${lang}"`);
    }
  });

  it('uses the same kind of entry (text or function) for a key in every language', () => {
    for (const [key, entry] of Object.entries(I.TEXTS.hu)) {
      for (const lang of I.LANGS) {
        assert.equal(typeof I.TEXTS[lang][key], typeof entry, `${lang}: ${key}`);
      }
    }
  });

  it('has a non-empty text or a function for every key', () => {
    for (const lang of I.LANGS) {
      for (const [key, entry] of Object.entries(I.TEXTS[lang])) {
        const ok = typeof entry === 'function' || (typeof entry === 'string' && entry.trim() !== '');
        assert.ok(ok, `${lang}: ${key}`);
      }
    }
  });
});

describe('t', () => {
  it('returns the text in the current language', () => {
    I.setLang('hu');
    assert.equal(I.t('lang.label'), 'Nyelv');
    I.setLang('en');
    assert.equal(I.t('lang.label'), 'Language');
  });

  it('fills in the values of a text that is a function', () => {
    I.setLang('en');
    assert.equal(I.t('table.meta', { seed: '1150', count: 12 }), 'seed 1150 · 12 photons');
    assert.equal(I.t('results.keyBits', { count: 1 }), '1 bit');
    I.setLang('hu');
    assert.equal(I.t('table.meta', { seed: '', count: 12 }), 'seed (üres) · 12 foton');
  });

  it('returns the key itself when there is no such text', () => {
    assert.equal(I.t('no.such.key'), 'no.such.key');
  });

  it('ignores an unknown language', () => {
    I.setLang('en');
    I.setLang('de');
    assert.equal(I.getLang(), 'en');
    I.setLang('hu');
  });
});

describe('Hungarian article', () => {
  it('uses "az" before numbers spoken with a leading vowel', () => {
    for (const n of [1, 5, 50, 55, 59, 500]) {
      assert.equal(huArticle(n), 'az', `az ${n}`);
    }
  });

  it('uses "a" before every other number', () => {
    for (const n of [0, 2, 3, 4, 6, 10, 11, 15, 21, 25, 32, 49, 60, 100]) {
      assert.equal(huArticle(n), 'a', `a ${n}`);
    }
  });
});

describe('photon lists', () => {
  it('lists photons in Hungarian with the right article in front', () => {
    assert.equal(huPhotons([3]), 'a 3.');
    assert.equal(huPhotons([1]), 'az 1.');
    assert.equal(huPhotons([5]), 'az 5.');
    assert.equal(huPhotons([1, 3]), 'az 1. és 3.');
    assert.equal(huPhotons([2, 3, 7]), 'a 2., 3. és 7.');
    assert.equal(huPhotons([]), '');
  });

  it('lists photons in English with singular or plural', () => {
    assert.equal(enPhotons([3]), 'photon 3');
    assert.equal(enPhotons([1, 3]), 'photons 1 and 3');
    assert.equal(enPhotons([2, 3, 7]), 'photons 2, 3 and 7');
    assert.equal(enPhotons([]), '');
  });
});
