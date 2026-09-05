import type { UnknownRecord } from './types';

export function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null;
}

export function safeString(value: unknown, fallback = '') {
    return typeof value === 'string' && value.length ? value : fallback;
}

export function firstString(...values: unknown[]) {
    for (const value of values) {
        if (typeof value !== 'string') {
            continue;
        }

        const trimmed = value.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }

    return '';
}

export function cloneValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(cloneValue);
    }

    if (!isRecord(value)) {
        return value;
    }

    const result: UnknownRecord = {};
    for (const [key, entry] of Object.entries(value)) {
        result[key] = cloneValue(entry);
    }

    return result;
}

export function isValidPort(value: unknown) {
    return Number.isFinite(value) && (value as number) > 0 && (value as number) < 65536;
}

export function toStringId(value: unknown) {
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return null;
}
