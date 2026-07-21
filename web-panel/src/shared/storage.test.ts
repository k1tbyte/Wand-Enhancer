import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadStringSet, saveStringSet } from './storage';

describe('storage revival', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('revives only valid string ids', () => {
    localStorage.setItem('pins', JSON.stringify(['one', '', 2, 'two']));
    expect(loadStringSet('pins')).toEqual({ one: true, two: true });
  });

  it('removes empty sets', () => {
    expect(saveStringSet('pins', { one: true })).toBe(true);
    expect(localStorage.getItem('pins')).toBe(JSON.stringify(['one']));
    expect(saveStringSet('pins', {})).toBe(true);
    expect(localStorage.getItem('pins')).toBeNull();
  });

  it('reports a failed browser storage write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });

    expect(saveStringSet('pins', { one: true })).toBe(false);
  });

  it('handles browsers that block access to local storage', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });

    expect(saveStringSet('pins', { one: true })).toBe(false);
    expect(loadStringSet('pins')).toEqual({});
  });
});
