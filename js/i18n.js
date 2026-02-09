const STORAGE_KEY = 'graph-creator-ui-language';
const MANIFEST_URL = 'i18n/locales.json';

const state = {
  current: 'fr',
  fallback: 'fr',
  locales: []
};

const translations = new Map();

function resolvePath(obj, key) {
  if (!obj || !key) return undefined;
  if (!key.includes('.')) return obj[key];
  return key.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

function interpolate(value, vars) {
  if (!vars) return value;
  return String(value).replace(/\{(\w+)\}/g, (_, name) => {
    const replacement = vars[name];
    return replacement == null ? '' : String(replacement);
  });
}

async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return res.json();
}

async function ensureLocaleLoaded(locale) {
  if (!locale || translations.has(locale)) return;
  try {
    const data = await loadJson(`i18n/${locale}.json`);
    translations.set(locale, data || {});
  } catch (err) {
    console.warn(`i18n: unable to load locale ${locale}`, err);
  }
}

function getTranslation(key, vars) {
  const currentDict = translations.get(state.current) || {};
  const fallbackDict = translations.get(state.fallback) || {};
  let value = resolvePath(currentDict, key);
  let found = value != null;
  if (!found) {
    value = resolvePath(fallbackDict, key);
    found = value != null;
  }
  if (!found) return { value: key, found: false };
  return { value: interpolate(value, vars), found: true };
}

export function t(key, vars) {
  return getTranslation(key, vars).value;
}

function applyToElement(el, key, prop, attrName) {
  if (!key) return;
  const { value, found } = getTranslation(key);
  if (!found) return;
  if (prop) {
    el[prop] = value;
    return;
  }
  if (attrName) {
    el.setAttribute(attrName, value);
  }
}

function translateElement(el) {
  applyToElement(el, el.dataset.i18n, 'textContent');
  applyToElement(el, el.dataset.i18nHtml, 'innerHTML');
  applyToElement(el, el.dataset.i18nPlaceholder, null, 'placeholder');
  applyToElement(el, el.dataset.i18nTitle, null, 'title');
  applyToElement(el, el.dataset.i18nAriaLabel, null, 'aria-label');
  applyToElement(el, el.dataset.i18nValue, 'value');
}

export function applyTranslations(root = document) {
  if (!root?.querySelectorAll) return;
  const selector = [
    '[data-i18n]',
    '[data-i18n-html]',
    '[data-i18n-placeholder]',
    '[data-i18n-title]',
    '[data-i18n-aria-label]',
    '[data-i18n-value]'
  ].join(',');
  root.querySelectorAll(selector).forEach(translateElement);
}

function updateDocumentLanguage() {
  if (document?.documentElement) {
    document.documentElement.lang = state.current || state.fallback || 'fr';
  }
}

function initLanguageSelect() {
  const select = document.getElementById('ui-language');
  if (!select) return;
  select.innerHTML = state.locales
    .map(locale => {
      const label = locale.label || locale.code;
      return `<option value="${locale.code}">${label}</option>`;
    })
    .join('');
  select.value = state.current;
  select.addEventListener('change', () => {
    setLocale(select.value);
  });
}

export async function setLocale(locale) {
  if (!locale) return;
  await ensureLocaleLoaded(locale);
  state.current = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  updateDocumentLanguage();
  applyTranslations();
  const select = document.getElementById('ui-language');
  if (select) select.value = locale;
}

function pickInitialLocale(preferred) {
  const codes = state.locales.map(l => l.code);
  if (preferred && codes.includes(preferred)) return preferred;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && codes.includes(stored)) return stored;
  const nav = (navigator?.language || '').split('-')[0];
  if (nav && codes.includes(nav)) return nav;
  if (state.fallback && codes.includes(state.fallback)) return state.fallback;
  return codes[0] || 'fr';
}

export async function initI18n(options = {}) {
  try {
    const manifest = await loadJson(MANIFEST_URL);
    state.fallback = manifest?.default || state.fallback;
    state.locales = Array.isArray(manifest?.locales) ? manifest.locales : [];
  } catch (err) {
    console.warn('i18n: failed to load manifest', err);
  }
  if (!state.locales.length) {
    state.locales = [{ code: state.fallback || 'fr', label: state.fallback || 'fr' }];
  }

  const initial = pickInitialLocale(options.locale);
  await ensureLocaleLoaded(state.fallback);
  await ensureLocaleLoaded(initial);
  state.current = initial;
  updateDocumentLanguage();
  initLanguageSelect();
  applyTranslations();
}
