import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import { getTrainerDisplayName } from '../category';
import type { LibraryGame } from '../game-library';
import type { TrainerSummary } from '../protocol';
import { GameCover } from './GameCover';

type TrainerHeaderProps = {
  trainer: TrainerSummary;
  game: LibraryGame | null;
  isPinned: boolean;
  onPin: () => void;
};

export const TrainerHeader = ({ trainer, game, isPinned, onPin }: TrainerHeaderProps) => {
  return (
    <section className="relative mb-3 mt-3.5 overflow-hidden rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-3.5 shadow-[0_8px_32px_-12px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.06)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_-20%,color-mix(in_oklab,var(--deck-accent)_28%,transparent),transparent_55%)]" />
      <div className="relative flex items-center gap-3">
        {game ? <GameCover game={game} size="lg" /> : <FallbackCover />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-(--deck-accent) shadow-[0_0_6px_var(--deck-accent)] motion-safe:animate-[breathe_2s_ease-in-out_infinite]" />
            <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-(--deck-accent)">Trainer Active</span>
          </div>
          <h2 className="mt-1 truncate text-base font-bold leading-tight text-(--deck-fg)">{getTrainerDisplayName(trainer)}</h2>
          <div className="mt-1 flex min-w-0 items-center gap-2.5 font-mono text-[11px] text-(--deck-fg-3)">
            <span className="truncate uppercase">{game?.platform ?? 'Wand'}</span>
            {trainer.gameVersion ? <span className="shrink-0">· v{trainer.gameVersion}</span> : null}
            <span className="min-w-0 truncate">· #{trainer.trainerId}</span>
          </div>
        </div>
        <button type="button" aria-label={isPinned ? 'Remove favorite' : 'Favorite game'} disabled={!game} className="flex size-8.5 shrink-0 items-center justify-center rounded-[9px] border border-white/10 bg-white/5 text-(--deck-fg-3) backdrop-blur-xl hover:text-(--deck-fg) disabled:cursor-not-allowed disabled:opacity-35 data-[active=true]:border-[color-mix(in_oklab,var(--deck-accent)_35%,transparent)] data-[active=true]:bg-[color-mix(in_oklab,var(--deck-accent)_18%,transparent)] data-[active=true]:text-(--deck-accent) data-[active=true]:shadow-[0_0_18px_-8px_var(--deck-accent)]" data-active={isPinned} onClick={onPin}>
          <Icon className={cn('size-4', isPinned ? 'drop-shadow-[0_0_5px_var(--deck-accent)]' : '')} name={isPinned ? 'star-filled' : 'star'} />
        </button>
      </div>
    </section>
  );
};

const FallbackCover = () => {
  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-[10px] border border-white/6 bg-[linear-gradient(135deg,rgba(238,0,255,0.28),rgba(0,0,0,0.48))] shadow-[inset_0_0_0_1px_rgba(255,255,255,.04),0_2px_6px_rgba(0,0,0,.35)]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.14),transparent_35%,rgba(0,0,0,.42))]" />
      <div className="absolute inset-x-1 bottom-1 truncate font-mono text-[8px] font-bold uppercase tracking-wider text-white/85 drop-shadow">WAND</div>
    </div>
  );
};
