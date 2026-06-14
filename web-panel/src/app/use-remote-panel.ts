import { useCallback, useMemo, useState } from 'react';

import { ECheatType } from '../../protocol/messages';
import { buildLibraryGames, getCurrentGame, type LibraryGame } from '../library/model/games';
import { useGamePins } from '../library/pinned-games/use-game-pins';
import { useRemoteSession } from '../remote-session/use-remote-session';
import { buildPinnedGroup, filterGroups, groupCheatsByCategory } from '../trainer/model/categories';
import { getPinnedStorageKey } from '../trainer/pinned-cheats/pinned-cheat-storage';
import { usePinnedCheats } from '../trainer/pinned-cheats/use-pinned-cheats';
import { getPresetStorageKey, type RemotePreset } from '../trainer/presets/preset-storage';
import { usePresets } from '../trainer/presets/use-presets';
import { useDockAutoHide } from './use-dock-auto-hide';

export function useRemotePanel() {
  const session = useRemoteSession();
  const [cheatQuery, setCheatQuery] = useState('');
  const [gameQuery, setGameQuery] = useState('');
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const dock = useDockAutoHide();

  const activeTrainer = session.state.trainerMeta?.trainer ?? null;
  const { pinnedGameIds, togglePin: toggleGamePin } = useGamePins();
  const libraryGames = useMemo(
    () => buildLibraryGames(session.state.installedApps, session.state.gameStatus, activeTrainer, pinnedGameIds),
    [activeTrainer, pinnedGameIds, session.state.gameStatus, session.state.installedApps],
  );
  const currentGame = useMemo(() => getCurrentGame(libraryGames), [libraryGames]);

  const pinnedStorageKey = useMemo(() => getPinnedStorageKey(activeTrainer), [activeTrainer]);
  const { pinnedTargets, toggle: togglePinnedCheat } = usePinnedCheats({ pinnedStorageKey });
  const groups = useMemo(() => groupCheatsByCategory(session.state.trainerMeta), [session.state.trainerMeta]);
  const pinnedGroup = useMemo(
    () => buildPinnedGroup(session.state.trainerMeta, pinnedTargets),
    [pinnedTargets, session.state.trainerMeta],
  );
  const filteredGroups = useMemo(() => filterGroups(groups, cheatQuery), [cheatQuery, groups]);
  const filteredPinnedGroup = useMemo(
    () => (pinnedGroup ? filterGroups([pinnedGroup], cheatQuery)[0] ?? null : null),
    [cheatQuery, pinnedGroup],
  );

  const presetStorageKey = useMemo(() => getPresetStorageKey(activeTrainer), [activeTrainer]);
  const presets = usePresets({
    presetStorageKey,
    trainerMeta: session.state.trainerMeta,
    values: session.state.values,
    onError: session.reportError,
  });

  const panic = useCallback(() => {
    const trainerMeta = session.state.trainerMeta;
    if (!trainerMeta) return;
    for (const cheat of trainerMeta.schema.cheats) {
      if (cheat.type === ECheatType.Toggle && Boolean(session.state.values[cheat.target])) {
        session.changeCheat(cheat, false);
      }
    }
  }, [session]);

  const applyPreset = useCallback((preset: RemotePreset) => {
    const trainerMeta = session.state.trainerMeta;
    if (!trainerMeta) return;
    for (const cheat of trainerMeta.schema.cheats) {
      if (cheat.target in preset.values) {
        session.changeCheat(cheat, preset.values[cheat.target]);
      }
    }
  }, [session]);

  const playGame = useCallback((game: LibraryGame) => {
    if (session.launchGame(game.app)) {
      setRightOpen(false);
    }
  }, [session]);

  const totalVisibleCheats = filteredGroups.reduce(
    (count, group) => count + group.cheats.length,
    filteredPinnedGroup?.cheats.length ?? 0,
  );

  return {
    session: {
      status: session.state.connectionStatus,
      wsUrl: session.state.wsUrl,
      lastError: session.state.lastError,
      values: session.state.values,
      pendingTargets: session.pendingTargets,
      connected: session.connected,
      socketReady: session.socketReady,
      connect: session.connect,
      disconnect: session.disconnect,
      setWsUrl: session.setWsUrl,
    },
    trainer: {
      activeTrainer,
      query: cheatQuery,
      setQuery: setCheatQuery,
      filteredGroups,
      filteredPinnedGroup,
      pinnedTargets,
      controlsDisabled: Boolean(activeTrainer?.trainerLoading || activeTrainer?.isTimeLimitExpired),
      totalVisibleCheats,
      totalCheats: session.state.trainerMeta?.schema.cheats.length ?? 0,
      changeCheat: session.changeCheat,
      togglePin: togglePinnedCheat,
      panic,
      presets: presets.presets,
      addPreset: presets.addPreset,
      applyPreset,
      deletePreset: presets.deletePreset,
    },
    library: {
      games: libraryGames,
      currentGame,
      pinnedGameIds,
      query: gameQuery,
      setQuery: setGameQuery,
      togglePin: toggleGamePin,
      playGame,
      stopPlaying: session.stopPlaying,
    },
    shell: {
      leftOpen,
      rightOpen,
      openSettings: () => setLeftOpen(true),
      closeSettings: () => setLeftOpen(false),
      openLibrary: () => setRightOpen(true),
      closeLibrary: () => setRightOpen(false),
      dockHidden: dock.hidden,
      onScroll: dock.onScroll,
    },
  };
}
