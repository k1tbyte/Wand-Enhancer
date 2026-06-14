import { beforeEach, describe, expect, it } from 'vitest';

import { ECheatType, type CheatSchema } from '../../../protocol/messages';
import { capturePresetValues, loadPresets, savePresets } from './preset-storage';

const cheats: CheatSchema[] = [
  { uuid: 'toggle', target: 'god', type: ECheatType.Toggle, name: 'God', category: 'player', args: {} },
  { uuid: 'button', target: 'apply', type: ECheatType.Button, name: 'Apply', category: 'player', args: {} },
];

describe('preset storage', () => {
  beforeEach(() => localStorage.clear());

  it('captures persistent values and excludes one-shot actions', () => {
    expect(capturePresetValues(cheats, { god: true, apply: 1 })).toEqual({ god: true });
  });

  it('revives valid presets and ignores malformed entries', () => {
    localStorage.setItem('presets', JSON.stringify([
      { id: 'valid', name: 'Valid', createdAt: 'now', values: { god: true } },
      { id: 'invalid', values: {} },
    ]));

    expect(loadPresets('presets')).toEqual([
      { id: 'valid', name: 'Valid', createdAt: 'now', values: { god: true } },
    ]);

    savePresets('presets', []);
    expect(localStorage.getItem('presets')).toBeNull();
  });
});
