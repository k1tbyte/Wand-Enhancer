import { afterEach, describe, expect, it, vi } from 'vitest';
import { triggerHaptic } from './haptics';

describe('haptics', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('calls navigator.vibrate when available', () => {
        const vibrateSpy = vi.fn();
        vi.stubGlobal('navigator', { vibrate: vibrateSpy });

        triggerHaptic(40);
        expect(vibrateSpy).toHaveBeenCalledWith(40);
    });

    it('falls back gracefully when navigator.vibrate throws or is missing', () => {
        vi.stubGlobal('navigator', {
            vibrate: () => {
                throw new Error('Not allowed');
            },
        });

        expect(() => triggerHaptic(30)).not.toThrow();
    });

    it('does not throw when navigator is undefined', () => {
        vi.stubGlobal('navigator', undefined);
        expect(() => triggerHaptic()).not.toThrow();
    });
});

