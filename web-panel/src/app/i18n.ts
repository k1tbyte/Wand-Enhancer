import { i18n, type Messages } from '@lingui/core';

export const DEFAULT_LOCALE = 'en-US';

export const SUPPORTED_LOCALES = [
  { code: 'en-US', label: 'English' },
  { code: 'ru-RU', label: 'Русский' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'es-ES', label: 'Español' },
  { code: 'zh-CN', label: '简体中文' },
] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code'];

const LOCALE_STORAGE_KEY = 'wand:locale';

type CatalogModule = { messages: Messages };

const catalogs = import.meta.glob<CatalogModule>('../locales/*/messages.po');

export async function activateLocale(locale: LocaleCode): Promise<void> {
  const loadCatalog = catalogs[`../locales/${locale}/messages.po`];
  if (!loadCatalog) {
    throw new Error(`Locale catalog not found: ${locale}`);
  }

  const { messages } = await loadCatalog();
  i18n.load(locale, messages);
  i18n.activate(locale);
  persistLocale(locale);
}

export function detectInitialLocale(): LocaleCode {
  return readStoredLocale() ?? matchBrowserLocale() ?? DEFAULT_LOCALE;
}

function readStoredLocale(): LocaleCode | null {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isSupportedLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

function matchBrowserLocale(): LocaleCode | null {
  const candidates = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  for (const candidate of candidates) {
    const base = candidate.split('-')[0];
    const match = SUPPORTED_LOCALES.find(({ code }) => code === candidate || code.split('-')[0] === base);
    if (match) {
      return match.code;
    }
  }

  return null;
}

function persistLocale(locale: LocaleCode): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage failures (private mode, blocked cookies, etc.).
  }
}

function isSupportedLocale(value: string | null): value is LocaleCode {
  return value !== null && SUPPORTED_LOCALES.some(({ code }) => code === value);
}
