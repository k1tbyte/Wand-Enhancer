import type { TrainerSummary } from './protocol';

type Reviver<T> = (raw: unknown) => T | null;

function getStore(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function getTrainerStorageId(trainer: TrainerSummary | null | undefined): string | null {
  if (!trainer) {
    return null;
  }

  const id = trainer.gameId?.trim() || trainer.titleId?.trim() || trainer.trainerId?.trim();
  return id || null;
}

export function loadJson<T>(key: string | null, revive: Reviver<T>, fallback: T): T {
  const store = getStore();
  if (!key || !store) {
    return fallback;
  }

  try {
    const raw = store.getItem(key);
    if (!raw) {
      return fallback;
    }

    return revive(JSON.parse(raw) as unknown) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string | null, value: unknown, isEmpty: (value: unknown) => boolean): void {
  const store = getStore();
  if (!key || !store) {
    return;
  }

  try {
    if (isEmpty(value)) {
      store.removeItem(key);
      return;
    }

    store.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage quota / serialization errors are non-critical for this UI.
  }
}

export function loadStringSet(key: string | null): Record<string, true> {
  return loadJson<Record<string, true>>(
    key,
    (raw) => {
      if (!Array.isArray(raw)) {
        return null;
      }

      const result: Record<string, true> = {};
      for (const value of raw) {
        if (typeof value === 'string' && value.length > 0) {
          result[value] = true;
        }
      }

      return result;
    },
    {},
  );
}

export function saveStringSet(key: string | null, value: Record<string, true>): void {
  const ids = Object.keys(value);
  saveJson(key, ids, () => ids.length === 0);
}
