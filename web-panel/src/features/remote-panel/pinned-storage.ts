import type { TrainerSummary } from './protocol';

const STORAGE_PREFIX = 'wand-remote.pinned-cheats.v1:';

export function getPinnedStorageKey(trainer: TrainerSummary | null | undefined): string | null {
  if (!trainer) {
    return null;
  }

  const id = trainer.gameId?.trim() || trainer.titleId?.trim() || trainer.trainerId?.trim();
  return id ? `${STORAGE_PREFIX}${id}` : null;
}

export function loadPinnedTargets(storageKey: string | null): Record<string, true> {
  if (!storageKey || typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {};
    }

    const next: Record<string, true> = {};
    for (const target of parsed) {
      if (typeof target === 'string' && target.length > 0) {
        next[target] = true;
      }
    }

    return next;
  } catch {
    return {};
  }
}

export function savePinnedTargets(storageKey: string | null, pinned: Record<string, true>): void {
  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  try {
    const targets = Object.keys(pinned);
    if (targets.length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(targets));
  } catch {
    // Ignore quota / serialization errors – pinning is a non-critical UX nicety.
  }
}
