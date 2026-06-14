import { useCallback, useEffect, useState } from 'react';

import type { CheatSchema } from '../../../protocol/messages';
import { loadPinnedTargets, savePinnedTargets } from './pinned-cheat-storage';

type PinnedTargetsParams = {
  pinnedStorageKey: string | null;
};

export function usePinnedCheats({ pinnedStorageKey }: PinnedTargetsParams) {
  const [pinnedTargets, setPinnedTargets] = useState<Record<string, true>>({});

  useEffect(() => {
    setPinnedTargets(loadPinnedTargets(pinnedStorageKey));
  }, [pinnedStorageKey]);

  const toggle = useCallback(
    (cheat: CheatSchema) => {
      setPinnedTargets((current) => {
        const next = { ...current };
        if (next[cheat.target]) delete next[cheat.target];
        else next[cheat.target] = true;
        savePinnedTargets(pinnedStorageKey, next);
        return next;
      });
    },
    [pinnedStorageKey],
  );

  return { pinnedTargets, toggle };
}
