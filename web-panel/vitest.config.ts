import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      restoreMocks: true,
      alias: {
        'react-dom/test-utils': 'preact/test-utils',
      },
      // Inline @lingui/react so its bare `react` import resolves to preact/compat
      // via the alias above instead of pulling in a second (real) React copy.
      server: { deps: { inline: [/@lingui\/react/] } },
    },
  }),
);
