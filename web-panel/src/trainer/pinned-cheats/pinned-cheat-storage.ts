import type { TrainerSummary } from '../../../protocol/messages';
import { getTrainerStorageId, loadStringSet, saveStringSet } from '../../shared/storage';

const STORAGE_PREFIX = 'wand-remote.pinned-cheats.v1:';

export function getPinnedStorageKey(trainer: TrainerSummary | null | undefined): string | null {
    const id = getTrainerStorageId(trainer);
    return id ? `${STORAGE_PREFIX}${id}` : null;
}

export function loadPinnedTargets(storageKey: string | null): Record<string, true> {
    return loadStringSet(storageKey);
}

export function savePinnedTargets(storageKey: string | null, pinned: Record<string, true>): void {
    saveStringSet(storageKey, pinned);
}
