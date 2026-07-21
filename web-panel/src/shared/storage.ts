import type { TrainerSummary } from '../../protocol/messages';

type Reviver<T> = (raw: unknown) => T | null;

function getStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
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

export function saveJson(key: string | null, value: unknown, isEmpty: (value: unknown) => boolean): boolean {
  const store = getStore();
  if (!key || !store) {
    return false;
  }

  try {
    if (isEmpty(value)) {
      store.removeItem(key);
      return true;
    }

    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
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

export function saveStringSet(key: string | null, value: Record<string, true>): boolean {
  const ids = Object.keys(value);
  return saveJson(key, ids, () => ids.length === 0);
}
