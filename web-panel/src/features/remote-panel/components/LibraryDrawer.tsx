import { memo, useMemo, type ReactNode } from 'react';

import { Icon, type IconName } from '@/components/ui/icon';

import { cn } from '@/lib/utils';
import { filterLibraryGames, formatHours, getLibrarySections, shortPath, type LibraryGame } from '../game-library';
import { GameCover } from './GameCover';
import { SearchInput } from './SearchInput';

type LibraryDrawerProps = {
  games: LibraryGame[];
  query: string;
  canLaunch: boolean;
  onClose: () => void;
  onPin: (game: LibraryGame) => void;
  onPlay: (game: LibraryGame) => void;
  onStop: () => void;
  onQueryChange: (query: string) => void;
};

const LibraryDrawerBase = ({ games, query, canLaunch, onClose, onPin, onPlay, onStop, onQueryChange }: LibraryDrawerProps) => {
  const filteredGames = useMemo(() => filterLibraryGames(games, query), [games, query]);
  const sections = useMemo(() => getLibrarySections(filteredGames), [filteredGames]);

  return (
    <div className="flex h-full flex-col">
      <header className="remote-glass-header flex items-center gap-2.5 border-b px-3.5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-(--deck-fg)">Library</h2>
          <p className="mt-0.5 font-mono text-[11px] text-(--deck-fg-4)">{games.length} games detected</p>
        </div>
        <button type="button" aria-label="Close library" className="remote-glass-control flex size-8 items-center justify-center rounded-[8px] border text-(--deck-fg-2) hover:text-(--deck-fg)" onClick={onClose}>
          <Icon className="size-4" name="x" />
        </button>
      </header>
      <div className="border-b border-white/6 px-3.5 py-2.5">
        <SearchInput value={query} placeholder="Search games" onChange={onQueryChange} />
      </div>
      <div className="remote-scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
        {sections.running ? (
          <GameSection accent count={1} icon="dot" title="Now Playing">
            <GameRow game={sections.running} canLaunch={canLaunch} query={query} onPin={onPin} onPlay={onPlay} onStop={onStop} />
          </GameSection>
        ) : null}
        {sections.pinned.length > 0 ? (
          <GameSection count={sections.pinned.length} icon="star-filled" title="Favorites">
            {sections.pinned.map((game) => <GameRow key={game.id} game={game} canLaunch={canLaunch} query={query} onPin={onPin} onPlay={onPlay} onStop={onStop} />)}
          </GameSection>
        ) : null}
        {sections.rest.length > 0 ? (
          <GameSection count={sections.rest.length} title="All Games">
            {sections.rest.map((game) => <GameRow key={game.id} game={game} canLaunch={canLaunch} query={query} onPin={onPin} onPlay={onPlay} onStop={onStop} />)}
          </GameSection>
        ) : null}
        {filteredGames.length === 0 ? (
          <p className="px-8 py-10 text-center text-[13px] text-(--deck-fg-4)">No games match "{query}"</p>
        ) : null}
      </div>
    </div>
  );
};

export const LibraryDrawer = memo(LibraryDrawerBase);

type GameSectionProps = {
  title: string;
  count?: number;
  icon?: IconName;
  accent?: boolean;
  children: ReactNode;
};

const GameSection = ({ title, count, icon, accent = false, children }: GameSectionProps) => {
  return (
    <section className="mt-2">
      <div className="flex items-center gap-2 px-3.5 pb-1.5 pt-3.5">
        {icon ? <Icon className={cn('size-3', accent ? 'text-(--deck-accent)' : 'text-(--deck-fg-4)')} name={icon} stroke={2} /> : null}
        <h3 className={cn('font-mono text-[10px] font-bold uppercase tracking-[0.18em]', accent ? 'text-(--deck-accent)' : 'text-(--deck-fg-4)')}>{title}</h3>
        <div className="h-px flex-1 bg-white/6" />
        {typeof count === 'number' ? <span className="font-mono text-[10px] text-(--deck-fg-4)">{count}</span> : null}
      </div>
      {children}
    </section>
  );
};

type GameRowProps = {
  game: LibraryGame;
  canLaunch: boolean;
  query: string;
  onPin: (game: LibraryGame) => void;
  onPlay: (game: LibraryGame) => void;
  onStop: () => void;
};

const GameRow = ({ game, canLaunch, query, onPin, onPlay, onStop }: GameRowProps) => {
  const hours = formatHours(game.hours);
  const handlePin = () => onPin(game);
  const handlePlay = () => onPlay(game);

  return (
    <article className={cn('mx-2 mb-1 flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]', game.running ? 'border-[color-mix(in_oklab,var(--deck-accent)_24%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_7%,transparent)]' : 'border-white/[0.07] bg-white/2.5')}>
      <GameCover game={game} />
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-[13.5px] font-semibold text-(--deck-fg)">{highlightTitle(game.title, query)}</h4>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[10.5px] tracking-[0.02em] text-(--deck-fg-3)">
          <span className="shrink-0">{game.platform.toUpperCase()}</span>
          {hours ? <span className="shrink-0">· {hours}</span> : null}
          {game.path ? <span className="min-w-0 truncate opacity-60">· {shortPath(game.path)}</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <IconButton active={game.pinned} label={game.pinned ? 'Remove favorite' : 'Favorite game'} icon={game.pinned ? 'star-filled' : 'star'} onClick={handlePin} />
        {game.running ? (
          <IconButton danger label="Stop playing" icon="stop" onClick={onStop} />
        ) : (
          <IconButton disabled={!canLaunch || !game.gameId} play label="Play" icon="play" onClick={handlePlay} />
        )}
      </div>
    </article>
  );
};

type IconButtonProps = {
  icon: IconName;
  label: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  play?: boolean;
  onClick: () => void;
};

const IconButton = ({ icon, label, active = false, danger = false, disabled = false, play = false, onClick }: IconButtonProps) => {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={cn(
        'remote-glass-control flex size-7.5 items-center justify-center rounded-[7px] border text-(--deck-fg-2) disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'border-[color-mix(in_oklab,var(--deck-accent)_38%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_16%,transparent)] text-(--deck-accent) shadow-[0_0_14px_-6px_var(--deck-accent)]' : '',
        play ? 'bg-[color-mix(in_oklab,var(--deck-accent)_15%,transparent)] text-(--deck-accent) ring-1 ring-[color-mix(in_oklab,var(--deck-accent)_35%,transparent)]' : '',
        danger ? 'bg-red-500/15 text-red-300 ring-1 ring-red-400/30' : '',
      )}
      onClick={onClick}
    >
      <Icon className={cn('size-3.5', active ? 'drop-shadow-[0_0_5px_var(--deck-accent)]' : '')} name={icon} />
    </button>
  );
};

function highlightTitle(title: string, query: string): ReactNode {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return title;
  }

  const index = title.toLowerCase().indexOf(normalized);
  if (index < 0) {
    return title;
  }

  const before = title.slice(0, index);
  const match = title.slice(index, index + query.length);
  const after = title.slice(index + query.length);
  return <>{before}<span className="rounded-[3px] bg-[color-mix(in_oklab,var(--deck-accent)_25%,transparent)] px-0.5 text-(--deck-fg)">{match}</span>{after}</>;
}
