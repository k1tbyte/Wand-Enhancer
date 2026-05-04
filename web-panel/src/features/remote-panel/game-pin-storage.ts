import { loadStringSet, saveStringSet } from './storage';
import type { LibraryGame } from './game-library';

const STORAGE_KEY = 'wand-remote.pinned-games.v1';

export function loadPinnedGameIds(): Record<string, true> {
  return loadStringSet(STORAGE_KEY);
}

export function savePinnedGameIds(pinnedGameIds: Record<string, true>): void {
  saveStringSet(STORAGE_KEY, pinnedGameIds);
}

export function togglePinnedGame(game: LibraryGame, pinnedGameIds: Record<string, true>): Record<string, true> {
  const next = { ...pinnedGameIds };
  if (next[game.id]) {
    delete next[game.id];
    return next;
  }

  next[game.id] = true;
  return next;
}
