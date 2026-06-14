function isRecord(value) {
    return typeof value === 'object' && value !== null;
}

function safeString(value, fallback = '') {
    return typeof value === 'string' && value.length ? value : fallback;
}

function firstString(...values) {
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

function cloneValue(value) {
    if (Array.isArray(value)) {
        return value.map(cloneValue);
    }

    if (!isRecord(value)) {
        return value;
    }

    const result = {};
    for (const [key, entry] of Object.entries(value)) {
        result[key] = cloneValue(entry);
    }

    return result;
}

function isValidPort(value) {
    return Number.isFinite(value) && value > 0 && value < 65536;
}

function toStringId(value) {
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return null;
}

module.exports = {
    cloneValue,
    firstString,
    isRecord,
    isValidPort,
    safeString,
    toStringId,
};
