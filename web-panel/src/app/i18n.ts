import { i18n } from '@lingui/core';

export const DEFAULT_LOCALE = 'en';

type CatalogModule = {
  default?: { messages: Record<string, string> };
  messages?: Record<string, string>;
};

const catalogs = import.meta.glob<CatalogModule>('../locales/*/messages.js');

export async function activateLocale(locale: string): Promise<void> {
  const loadCatalog = catalogs[`../locales/${locale}/messages.js`];
  if (!loadCatalog) {
    throw new Error(`Locale catalog not found: ${locale}`);
  }

  const catalog = await loadCatalog();
  const messages = catalog.messages ?? catalog.default?.messages;
  if (!messages) {
    throw new Error(`Locale catalog is invalid: ${locale}`);
  }

  i18n.load(locale, messages);
  i18n.activate(locale);
}
