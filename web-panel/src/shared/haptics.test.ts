import { afterEach, describe, expect, it, vi } from 'vitest';

import { hapticTap } from './haptics';

describe('hapticTap', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('vibrates briefly when the browser supports it', () => {
        const vibrate = vi.fn();
        vi.stubGlobal('navigator', { vibrate });

        hapticTap();

        expect(vibrate).toHaveBeenCalledExactlyOnceWith(expect.any(Number));
    });

    it('does nothing where the Vibration API is missing', () => {
        vi.stubGlobal('navigator', {});

        expect(() => hapticTap()).not.toThrow();
    });
});
