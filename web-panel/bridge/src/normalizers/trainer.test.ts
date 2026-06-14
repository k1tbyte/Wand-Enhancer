import { describe, expect, it } from 'vitest';

import { normalizeTrainerValue } from './trainer';

describe('trainer normalization', () => {
  it('normalizes toggle values before they reach clients or Wand', () => {
    const snapshot = {
      trainerMeta: {
        schema: { cheats: [{ target: 'god', type: 'toggle' }] },
      },
    };

    expect(normalizeTrainerValue(snapshot, 'god', 1)).toBe(true);
    expect(normalizeTrainerValue(snapshot, 'god', 0)).toBe(false);
    expect(normalizeTrainerValue(snapshot, 'speed', 2)).toBe(2);
  });
});
