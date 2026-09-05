const NUMBER_FORMAT_LOCALE = 'en-US';
const NUMBER_MAX_FRACTION_DIGITS = 6;
const NUMBER_GROUP_SEPARATOR_PATTERN = /[,\s]/g;
const numberFormats = new Map<number, Intl.NumberFormat>();

export function formatInputNumber(
    value: unknown,
    maximumFractionDigits = NUMBER_MAX_FRACTION_DIGITS,
): string {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    const numeric = numericValue(value, Number.NaN);
    return Number.isFinite(numeric)
        ? numberFormat(maximumFractionDigits).format(numeric)
        : String(value);
}

export function numericValue(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value !== 'string') {
        return fallback;
    }

    const parsed = Number(stripNumberGrouping(value));
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function stripNumberGrouping(value: string): string {
    return value.replace(NUMBER_GROUP_SEPARATOR_PATTERN, '');
}

function numberFormat(maximumFractionDigits: number): Intl.NumberFormat {
    let format = numberFormats.get(maximumFractionDigits);
    if (!format) {
        format = new Intl.NumberFormat(NUMBER_FORMAT_LOCALE, { maximumFractionDigits });
        numberFormats.set(maximumFractionDigits, format);
    }
    return format;
}
