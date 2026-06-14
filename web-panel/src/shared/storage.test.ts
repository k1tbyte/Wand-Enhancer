import { beforeEach, describe, expect, it } from 'vitest';

import { loadStringSet, saveStringSet } from './storage';

describe('storage revival', () => {
  beforeEach(() => localStorage.clear());

  it('revives only valid string ids', () => {
    localStorage.setItem('pins', JSON.stringify(['one', '', 2, 'two']));
    expect(loadStringSet('pins')).toEqual({ one: true, two: true });
  });

  it('removes empty sets', () => {
    saveStringSet('pins', { one: true });
    expect(localStorage.getItem('pins')).toBe(JSON.stringify(['one']));
    saveStringSet('pins', {});
    expect(localStorage.getItem('pins')).toBeNull();
  });
});
