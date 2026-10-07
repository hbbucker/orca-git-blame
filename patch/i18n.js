(() => {
  const NAMESPACE = 'orcaGitBlame';

  // invariant: as chaves de todo idioma espelham as de `en`, que é o fallback do Orca (fallbackLng: 'en').
  const CATALOGS = {
    en: { hide: 'Hide Inline Git Blame', show: 'Show Inline Git Blame', uncommitted: 'You • Uncommitted changes' },
    'pt-BR': { hide: 'Ocultar Git Blame da linha', show: 'Mostrar Git Blame da linha', uncommitted: 'Você • Alterações não commitadas' },
    es: { hide: 'Ocultar Git Blame en línea', show: 'Mostrar Git Blame en línea', uncommitted: 'Tú • Cambios sin confirmar' },
    fr: { hide: 'Masquer le Git Blame en ligne', show: 'Afficher le Git Blame en ligne', uncommitted: 'Vous • Modifications non validées' },
    ja: { hide: 'インライン Git Blame を非表示', show: 'インライン Git Blame を表示', uncommitted: 'あなた • 未コミットの変更' },
    ko: { hide: '인라인 Git Blame 숨기기', show: '인라인 Git Blame 표시', uncommitted: '나 • 커밋되지 않은 변경 사항' },
    zh: { hide: '隐藏行内 Git Blame', show: '显示行内 Git Blame', uncommitted: '你 • 未提交的更改' },
  };

  const UNITS = [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['week', 7 * 24 * 3600],
    ['day', 24 * 3600],
    ['hour', 3600],
    ['minute', 60],
  ];

  // why: idioma vindo de language pack chega ao i18next como "plugin" + hex UTF-16 de "plugin:<pluginKey>/<locale>" (plugin-language-packs do Orca).
  function decodePluginLanguage(language) {
    const match = /^plugin((?:[0-9a-f]{4})+)$/.exec(language);
    if (!match) return null;
    let id = '';
    for (let i = 0; i < match[1].length; i += 4) id += String.fromCharCode(Number.parseInt(match[1].slice(i, i + 4), 16));
    return id.startsWith('plugin:') && id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : null;
  }

  function localeOf(language) {
    const locale = decodePluginLanguage(language ?? '') ?? language ?? 'en';
    try {
      return Intl.DateTimeFormat.supportedLocalesOf(locale)[0] ?? 'en';
    } catch {
      return 'en';
    }
  }

  function catalogFor(locale) {
    if (CATALOGS[locale]) return CATALOGS[locale];
    const base = locale.split('-')[0];
    const match = Object.keys(CATALOGS).find((key) => key.split('-')[0] === base);
    return CATALOGS[match ?? 'en'];
  }

  function formatRelative(epochSeconds, locale, nowMs = Date.now()) {
    const diff = Math.round(epochSeconds - nowMs / 1000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    for (const [unit, seconds] of UNITS) {
      if (Math.abs(diff) >= seconds) return rtf.format(Math.round(diff / seconds), unit);
    }
    return rtf.format(0, 'minute');
  }

  function createTranslator(i18n) {
    const locale = () => localeOf(i18n?.language ?? globalThis.navigator?.language);

    // why: registrar o catálogo no i18next do Orca deixa a tradução seguir o seletor de idioma dele, inclusive language packs.
    const register = () => {
      if (!i18n?.addResourceBundle || !i18n.language) return;
      i18n.addResourceBundle(i18n.language, 'translation', { [NAMESPACE]: catalogFor(locale()) }, true, false);
    };
    register();

    const t = (key) => {
      const fallback = catalogFor(locale())[key] ?? CATALOGS.en[key];
      return i18n?.t ? i18n.t(`${NAMESPACE}.${key}`, { defaultValue: fallback }) : fallback;
    };

    const formatBlame = (blame, nowMs) => {
      if (!blame) return null;
      if (blame.uncommitted) return t('uncommitted');
      const when = blame.authorTime ? formatRelative(blame.authorTime, locale(), nowMs) : '';
      return `${blame.author}, ${when} • ${blame.summary}`;
    };

    const onChange = (listener) => {
      if (!i18n?.on) return () => {};
      const handler = () => {
        register();
        listener();
      };
      i18n.on('languageChanged', handler);
      return () => i18n.off?.('languageChanged', handler);
    };

    return { t, formatBlame, locale, onChange };
  }

  const api = { createTranslator, decodePluginLanguage, localeOf, formatRelative, CATALOGS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else globalThis.__orcaGitBlameI18n = api;
})();
