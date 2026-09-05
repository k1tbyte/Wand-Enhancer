// Keep floating-point drift out of values sent to Wand.
export function snapToStep(value: number, step: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    const decimals = decimalPlaces(step);
    return decimals === 0 ? Math.round(value) : Number(value.toFixed(decimals));
}

export function decimalPlaces(step: number): number {
    if (!Number.isFinite(step) || Number.isInteger(step)) {
        return 0;
    }

    const [coefficient, exponent = '0'] = step.toString().toLowerCase().split('e');
    return Math.max(0, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent));
}

export function clampToStep(value: number, min: number, max: number, step: number): number {
    const snapped = min + Math.round((value - min) / step) * step;
    const precision = Math.max(decimalPlaces(min), decimalPlaces(step));
    return Math.max(min, Math.min(max, Number(snapped.toFixed(precision))));
}
