import { beforeEach, describe, expect, it } from 'vitest';

import { type CheatSchema, ECheatType } from '../../../protocol/messages';
import {
    capturePresetValues,
    exportPresetsJson,
    importPresetsJson,
    loadPresets,
    savePresets,
} from './preset-storage';

const cheats: CheatSchema[] = [
    {
        uuid: 'toggle',
        target: 'god',
        type: ECheatType.Toggle,
        name: 'God',
        category: 'player',
        args: {},
    },
    {
        uuid: 'button',
        target: 'apply',
        type: ECheatType.Button,
        name: 'Apply',
        category: 'player',
        args: {},
    },
];

describe('preset storage', () => {
    beforeEach(() => localStorage.clear());

    it('captures persistent values and excludes one-shot actions', () => {
        expect(capturePresetValues(cheats, { god: true, apply: 1 })).toEqual({ god: true });
    });

    it('revives valid presets and ignores malformed entries', () => {
        localStorage.setItem(
            'presets',
            JSON.stringify([
                { id: 'valid', name: 'Valid', createdAt: 'now', values: { god: true } },
                { id: 'invalid', values: {} },
            ]),
        );

        expect(loadPresets('presets')).toEqual([
            { id: 'valid', name: 'Valid', createdAt: 'now', values: { god: true } },
        ]);

        savePresets('presets', []);
        expect(localStorage.getItem('presets')).toBeNull();
    });

    it('exports presets to a JSON string and imports them back safely', () => {
        const initial = [
            { id: 'p1', name: 'Preset 1', createdAt: '2026-10-08T00:00:00Z', values: { god: true } },
        ];
        savePresets('test_key', initial);

        const exported = exportPresetsJson('test_key');
        expect(exported).toContain('Preset 1');
        expect(exported).toContain('god');

        // Test importing into a fresh key
        const result = importPresetsJson('new_key', exported);
        expect(result.count).toBe(1);
        expect(loadPresets('new_key')).toEqual(initial);

        // Test importing invalid JSON
        const invalidResult = importPresetsJson('new_key', 'not valid json');
        expect(invalidResult.count).toBe(0);
    });
});
