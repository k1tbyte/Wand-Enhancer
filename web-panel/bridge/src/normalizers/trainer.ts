export function normalizeTrainerValue(snapshot, target, value) {
    const cheat = snapshot?.trainerMeta?.schema?.cheats?.find((entry) => entry.target === target);
    return cheat?.type === 'toggle' ? Boolean(value) : cloneValue(value);
}

function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
}
