/**
 * Rounds to the step's decimal precision. Repeated `value + step` on a fractional
 * step drifts (0.1 + 0.2 -> 0.30000000000000004) and that drift is sent on the wire.
 */
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

    return step.toString().split('.')[1]?.length ?? 0;
}
