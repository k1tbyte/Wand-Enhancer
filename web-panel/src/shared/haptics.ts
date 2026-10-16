/**
 * Triggers a light haptic vibration on devices supporting the Vibration API.
 * Safely handles unsupported browsers or security exceptions.
 */
export function triggerHaptic(duration = 35): void {
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(duration);
        }
    } catch {
        // Ignored on platforms without vibration or inside restricted frames.
    }
}

