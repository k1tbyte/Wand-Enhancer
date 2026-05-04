import { loadJson, saveJson } from './storage';

export const DEFAULT_ACCENT_COLOR = '#00ffd5';

const ACCENT_COLOR_STORAGE_KEY = 'wand-remote.accent-color.v1';
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function applySavedAccentColor(): string {
  return applyAccentColor(loadAccentColor());
}

export function loadAccentColor(): string {
  return loadJson<string>(ACCENT_COLOR_STORAGE_KEY, reviveAccentColor, DEFAULT_ACCENT_COLOR);
}

export function setAccentColor(value: string): string {
  const nextColor = normalizeAccentColor(value) ?? DEFAULT_ACCENT_COLOR;
  applyAccentColor(nextColor);
  saveJson(ACCENT_COLOR_STORAGE_KEY, nextColor, (storedValue) => storedValue === DEFAULT_ACCENT_COLOR);
  return nextColor;
}

function applyAccentColor(value: string): string {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--deck-accent', value);
  }

  return value;
}

function reviveAccentColor(raw: unknown): string | null {
  return normalizeAccentColor(raw);
}

function normalizeAccentColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return HEX_COLOR_PATTERN.test(normalizedValue) ? normalizedValue : null;
}