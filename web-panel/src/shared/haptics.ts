const TAP_MS = 20;

/** Short tap on phones with the Vibration API (Android browsers; iOS Safari has none). Decoration only. */
export function hapticTap(): void {
    if (typeof navigator.vibrate === 'function') {
        navigator.vibrate(TAP_MS);
    }
}
