import { useCallback, useEffect, useState } from 'react';

import type { LibraryGame } from '../model/games';
import { loadPinnedGameIds, savePinnedGameIds, togglePinnedGame } from './game-pin-storage';

export function useGamePins() {
  const [pinnedGameIds, setPinnedGameIds] = useState<Record<string, true>>({});

  useEffect(() => {
    setPinnedGameIds(loadPinnedGameIds());
  }, []);

  const togglePin = useCallback((game: LibraryGame) => {
    setPinnedGameIds((current) => {
      const next = togglePinnedGame(game, current);
      savePinnedGameIds(next);
      return next;
    });
  }, []);

  return { pinnedGameIds, togglePin };
}
