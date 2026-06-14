import { defineConfig } from '@lingui/cli';
import { formatter } from '@lingui/format-po';

export default defineConfig({
  sourceLocale: 'en-US',
  locales: ['en-US', 'ru-RU', 'de-DE', 'fr-FR', 'es-ES', 'zh-CN'],
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}/messages',
      include: ['src'],
    },
  ],
  format: formatter({ lineNumbers: false }),
});
