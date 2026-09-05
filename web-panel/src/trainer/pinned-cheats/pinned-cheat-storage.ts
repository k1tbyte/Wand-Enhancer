import type { TrainerSummary } from '../../../protocol/messages';
import { getTrainerStorageId } from '../../shared/storage';

const STORAGE_PREFIX = 'wand-remote.pinned-cheats.v1:';

export function getPinnedStorageKey(trainer: TrainerSummary | null | undefined): string | null {
    const id = getTrainerStorageId(trainer);
    return id ? `${STORAGE_PREFIX}${id}` : null;
}
