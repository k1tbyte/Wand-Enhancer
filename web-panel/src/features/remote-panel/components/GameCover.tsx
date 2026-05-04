import { useState } from 'react';

import { getGameCoverLabel, type LibraryGame } from '../game-library';

type GameCoverProps = {
  game: LibraryGame;
  size?: 'sm' | 'lg';
};

const SIZE_CLASSES: Record<NonNullable<GameCoverProps['size']>, string> = {
  lg: 'size-16 rounded-[10px] text-[8px]',
  sm: 'size-11 rounded-[9px] text-[7px]',
};

export const GameCover = ({ game, size = 'sm' }: GameCoverProps) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const sizeClass = SIZE_CLASSES[size];
  const imageUrl = game.imageUrl && game.imageUrl !== failedUrl ? game.imageUrl : null;

  const handleImageError = () => setFailedUrl(game.imageUrl ?? null);

  return (
    <div className={`relative shrink-0 overflow-hidden border border-white/6 bg-[linear-gradient(135deg,rgba(238,0,255,0.28),rgba(0,0,0,0.48))] shadow-[inset_0_0_0_1px_rgba(255,255,255,.04),0_2px_6px_rgba(0,0,0,.35)] ${sizeClass}`}>
      {imageUrl ? <img alt="" className="absolute inset-0 size-full object-cover" src={imageUrl} loading="lazy" onError={handleImageError} /> : null}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.14),transparent_35%,rgba(0,0,0,.42))]" />
      {game.running ? <span className="absolute right-1 top-1 size-1.5 rounded-full bg-(--deck-accent) shadow-[0_0_6px_var(--deck-accent)]" /> : null}
      <div className="absolute inset-x-1 bottom-1 truncate font-mono font-bold uppercase tracking-wider text-white/85 drop-shadow">
        {getGameCoverLabel(game)}
      </div>
    </div>
  );
};
