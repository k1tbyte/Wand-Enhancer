import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { applySavedAccentColor } from '@/features/remote-panel/accent-storage';

import { App } from './app';
import './index.css';

const root = document.getElementById('root') ?? document.getElementById('app');

if (!root) {
  throw new Error('App root not found.');
}

applySavedAccentColor();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
