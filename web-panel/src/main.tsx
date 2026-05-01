import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './index.css';

const root = document.getElementById('root') ?? document.getElementById('app');

if (!root) {
  throw new Error('App root not found.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
