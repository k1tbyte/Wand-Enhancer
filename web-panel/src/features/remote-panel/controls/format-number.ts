const NUMBER_FORMAT_LOCALE = 'en-US';
const NUMBER_MAX_FRACTION_DIGITS = 6;
const NUMBER_GROUP_SEPARATOR_PATTERN = /[,\s]/g;

export const groupedNumberFormat = new Intl.NumberFormat(NUMBER_FORMAT_LOCALE, { maximumFractionDigits: NUMBER_MAX_FRACTION_DIGITS });

export function formatNumber(value: number, step: number): string {
  if (step >= 1) {
    return String(Math.round(value));
  }

  const decimals = step.toString().split('.')[1]?.length ?? 1;
  return value.toFixed(decimals);
}

export function formatInputNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const numeric = numericValue(value, Number.NaN);
  return Number.isFinite(numeric) ? groupedNumberFormat.format(numeric) : String(value);
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
