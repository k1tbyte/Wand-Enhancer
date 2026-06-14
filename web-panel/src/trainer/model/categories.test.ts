import { describe, expect, it } from 'vitest';

import { ECheatType, type TrainerMetaPayload } from '../../../protocol/messages';
import { buildPinnedGroup, filterGroups, groupCheatsByCategory } from './categories';

const trainerMeta: TrainerMetaPayload = {
  session: { instanceId: 'session' },
  trainer: {
    trainerId: 'trainer',
    gameId: 'game',
    trainerLoading: false,
    gameInstalled: true,
    needsCompatibilityWarning: false,
    isTimeLimitExpired: false,
  },
  schema: {
    categories: ['player', 'world'],
    cheats: [
      { uuid: '1', target: 'health', type: ECheatType.Toggle, name: 'Infinite Health', category: 'player', args: {} },
      { uuid: '2', target: 'time', type: ECheatType.Slider, name: 'World Time', category: 'world', args: {} },
    ],
  },
};

describe('trainer categories', () => {
  it('groups, filters and projects pinned cheats', () => {
    const groups = groupCheatsByCategory(trainerMeta);
    expect(groups.map((group) => group.id)).toEqual(['player', 'world']);
    expect(filterGroups(groups, 'health')[0]?.cheats.map((cheat) => cheat.target)).toEqual(['health']);
    expect(buildPinnedGroup(trainerMeta, { time: true })?.cheats.map((cheat) => cheat.target)).toEqual(['time']);
  });
});
