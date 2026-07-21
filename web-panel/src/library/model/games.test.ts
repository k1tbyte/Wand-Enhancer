import { describe, expect, it } from 'vitest';

import type { InstalledAppSummary } from '../../../protocol/messages';
import { buildLibraryGames, filterLibraryGames, getCurrentGame } from './games';
import { togglePinnedGame } from '../pinned-games/game-pin-storage';

const apps: InstalledAppSummary[] = [
  {
    platform: 'steam',
    sku: 'one',
    correlationId: 'steam:one',
    displayName: 'Alpha Game',
    gameId: 'game-one',
  },
  {
    platform: 'epic',
    sku: 'two',
    correlationId: 'epic:two',
    displayName: 'Beta Game',
    gameId: 'game-two',
  },
];

describe('library models', () => {
  it('projects running and pinned games and filters them', () => {
    const games = buildLibraryGames(apps, {
      instanceId: 'status',
      updatedAt: 'now',
      session: { state: 'running', event: 'snapshot', gameId: 'game-two' },
      trainer: { state: 'idle', event: 'snapshot' },
    }, null, { 'game-one': true });

    expect(getCurrentGame(games)?.id).toBe('game-two');
    expect(games.find((game) => game.id === 'game-one')?.pinned).toBe(true);
    expect(filterLibraryGames(games, 'alpha').map((game) => game.id)).toEqual(['game-one']);
  });

  it('toggles pins without mutating the current set', () => {
    const game = buildLibraryGames([apps[0]], null, null, {})[0];
    const current = {};
    const next = togglePinnedGame(game, current);
    expect(next).toEqual({ 'game-one': true });
    expect(current).toEqual({});
    expect(togglePinnedGame(game, next)).toEqual({});
  });
});
