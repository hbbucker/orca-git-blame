import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { createTranslator, decodePluginLanguage, localeOf, CATALOGS } = require('../patch/i18n.js');

function pluginLanguage(id) {
  return `plugin${[...id].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`;
}

function fakeI18n(language) {
  const bundles = {};
  const listeners = [];
  return {
    language,
    addResourceBundle(lng, ns, resources) {
      bundles[lng] = { ...bundles[lng], ...resources };
    },
    t(key, { defaultValue }) {
      const [ns, k] = key.split('.');
      return bundles[this.language]?.[ns]?.[k] ?? defaultValue;
    },
    on(event, fn) {
      if (event === 'languageChanged') listeners.push(fn);
    },
    changeLanguage(lng) {
      this.language = lng;
      listeners.forEach((fn) => fn(lng));
    },
    bundles,
  };
}

const BLAME = { uncommitted: false, author: 'Ana', authorTime: 1700000000, summary: 'fix: x' };
const NOW = (1700000000 + 2 * 24 * 3600) * 1000;

test('todo idioma tem as mesmas chaves do inglês', () => {
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(CATALOGS.en).sort(), locale);
  }
});

test('decodifica o idioma de language pack do Orca', () => {
  assert.equal(decodePluginLanguage(pluginLanguage('plugin:stablyai.orca-portuguese/pt-BR')), 'pt-BR');
  assert.equal(decodePluginLanguage('en'), null);
  assert.equal(localeOf(pluginLanguage('plugin:stablyai.orca-portuguese/pt-BR')), 'pt-BR');
});

test('inglês é o padrão e registra o catálogo no i18next do Orca', () => {
  const i18n = fakeI18n('en');
  const tr = createTranslator(i18n);
  assert.equal(tr.t('hide'), 'Hide Inline Git Blame');
  assert.equal(tr.formatBlame(BLAME, NOW), 'Ana, 2 days ago • fix: x');
  assert.equal(tr.formatBlame({ uncommitted: true }), 'You • Uncommitted changes');
  assert.equal(i18n.bundles.en.orcaGitBlame.show, 'Show Inline Git Blame');
});

test('segue a troca de idioma do Orca, inclusive language pack pt-BR', () => {
  const i18n = fakeI18n('en');
  const tr = createTranslator(i18n);
  let changes = 0;
  tr.onChange(() => changes++);
  i18n.changeLanguage(pluginLanguage('plugin:stablyai.orca-portuguese/pt-BR'));
  assert.equal(changes, 1);
  assert.equal(tr.t('show'), 'Mostrar Git Blame da linha');
  assert.equal(tr.formatBlame(BLAME, NOW), 'Ana, anteontem • fix: x');
  i18n.changeLanguage('ja');
  assert.equal(tr.t('hide'), 'インライン Git Blame を非表示');
});

test('idioma sem catálogo cai para inglês e sem i18next usa o navegador', () => {
  assert.equal(createTranslator(fakeI18n('de')).t('hide'), 'Hide Inline Git Blame');
  assert.equal(createTranslator(null).t('uncommitted').length > 0, true);
});
