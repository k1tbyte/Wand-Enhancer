import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { applySavedAccentColor } from '@/appearance/appearance-storage';

import { App } from './app';
import { activateLocale, detectInitialLocale } from './i18n';
import '../index.css';

const root = document.getElementById('root') ?? document.getElementById('app');

if (!root) {
    throw new Error('App root not found.');
}

applySavedAccentColor();

function render() {
    createRoot(root!).render(
        <StrictMode>
            <I18nProvider i18n={i18n}>
                <App />
            </I18nProvider>
        </StrictMode>,
    );
}

// A failed catalog fetch (flaky LAN, cache miss) must not leave a blank page:
// mount anyway and let lingui fall back to the source strings.
activateLocale(detectInitialLocale())
    .catch(() => undefined)
    .then(render);
