import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';

import { Icon } from '@/shared/ui/Icon';

import type { LibraryGame } from '@/library/model/games';
import type { TrainerSummary } from '../../../protocol/messages';
import type { EConnectionStatus } from '@/remote-session/remote-session.reducer';
import { StatusPill } from './StatusPill';

type TopBarProps = {
  status: EConnectionStatus;
  currentGame: LibraryGame | null;
  runningTrainer: TrainerSummary | null;
  onOpenSettings: () => void;
};

export const TopBar = ({ status, currentGame, runningTrainer, onOpenSettings }: TopBarProps) => {
  const { _ } = useLingui();

  return (
    <header className="remote-glass-header sticky top-0 z-20 border-b px-3.5 pb-2.5 pt-3">
      <div className="flex items-center gap-2.5">
        <button type="button" aria-label={_(msg`Settings`)} className="remote-glass-control flex size-[34px] shrink-0 items-center justify-center rounded-[9px] border text-(--deck-fg-2) hover:text-(--deck-fg)" onClick={onOpenSettings}>
          <Icon className="size-[18px]" name="menu" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9.5px] font-bold tracking-[0.16em] text-(--deck-fg-4)">WAND · REMOTE DECK</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-semibold text-(--deck-fg)">
              {currentGame ? currentGame.title : <Trans>Idle · no game</Trans>}
            </span>
            {currentGame && runningTrainer?.gameVersion ? (
              <span className="shrink-0 rounded-[4px] bg-[color-mix(in_oklab,var(--deck-accent)_12%,transparent)] px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-[0.06em] text-(--deck-accent)">
                v{runningTrainer.gameVersion}
              </span>
            ) : null}
          </div>
        </div>
        <StatusPill status={status} />
      </div>
    </header>
  );
};
