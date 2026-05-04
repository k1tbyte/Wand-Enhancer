import { useEffect, useMemo, useReducer, useRef, useState, type UIEvent } from 'react';

import { buildPinnedGroup, filterGroups, groupCheatsByCategory } from '@/features/remote-panel/category';
import { CategorySection } from '@/features/remote-panel/components/CategorySection';
import { Drawer } from '@/features/remote-panel/components/Drawer';
import { FloatingDock } from '@/features/remote-panel/components/FloatingDock';
import { LibraryDrawer } from '@/features/remote-panel/components/LibraryDrawer';
import { PlaceholderState } from '@/features/remote-panel/components/PlaceholderState';
import { QuickActions } from '@/features/remote-panel/components/QuickActions';
import { SearchInput } from '@/features/remote-panel/components/SearchInput';
import { SettingsDrawer } from '@/features/remote-panel/components/SettingsDrawer';
import { TopBar } from '@/features/remote-panel/components/TopBar';
import { TrainerHeader } from '@/features/remote-panel/components/TrainerHeader';
import { buildLibraryGames, getCurrentGame, type LibraryGame } from '@/features/remote-panel/game-library';
import { loadPinnedGameIds, savePinnedGameIds, togglePinnedGame } from '@/features/remote-panel/game-pin-storage';
import { handleProtocolMessage } from '@/features/remote-panel/message-handler';
import { getPinnedStorageKey, loadPinnedTargets, savePinnedTargets } from '@/features/remote-panel/pinned-storage';
import { capturePresetValues, createPreset, getPresetStorageKey, loadPresets, savePresets, type RemotePreset } from '@/features/remote-panel/preset-storage';
import { normalizeOutgoingValue, type CheatSchema, type InstalledAppSummary, type TrainerMetaPayload } from '@/features/remote-panel/protocol';
import { ECheatType } from '@/features/remote-panel/protocol';
import { PanelSocketClient } from '@/features/remote-panel/socket-client';
import { createInitialPanelState, EConnectionStatus, panelReducer } from '@/features/remote-panel/state';

const SCROLL_HIDE_THRESHOLD_PX = 60;
const SCROLL_REVEAL_DEAD_ZONE_PX = 4;

export const App = () => {
  const [state, dispatch] = useReducer(panelReducer, createInitialPanelState());
  const [cheatQuery, setCheatQuery] = useState('');
  const [gameQuery, setGameQuery] = useState('');
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [hideDock, setHideDock] = useState(false);
  const [pinnedGameIds, setPinnedGameIds] = useState<Record<string, true>>({});
  const [presets, setPresets] = useState<RemotePreset[]>([]);
  const lastScrollRef = useRef(0);
  const clientRef = useRef<PanelSocketClient | null>(null);
  const trainerMetaRef = useRef<TrainerMetaPayload | null>(state.trainerMeta);

  useEffect(() => {
    setPinnedGameIds(loadPinnedGameIds());
    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    trainerMetaRef.current = state.trainerMeta;
  }, [state.trainerMeta]);

  const activeTrainer = state.trainerMeta?.trainer ?? null;
  const libraryGames = useMemo(
    () => buildLibraryGames(state.installedApps, state.gameStatus, activeTrainer, pinnedGameIds),
    [activeTrainer, pinnedGameIds, state.gameStatus, state.installedApps],
  );
  const currentGame = useMemo(() => getCurrentGame(libraryGames), [libraryGames]);
  const groups = useMemo(() => groupCheatsByCategory(state.trainerMeta), [state.trainerMeta]);
  const pinnedGroup = useMemo(() => buildPinnedGroup(state.trainerMeta, state.pinnedTargets), [state.trainerMeta, state.pinnedTargets]);
  const filteredGroups = useMemo(() => filterGroups(groups, cheatQuery), [cheatQuery, groups]);
  const filteredPinnedGroup = useMemo(
    () => (pinnedGroup ? filterGroups([pinnedGroup], cheatQuery)[0] ?? null : null),
    [cheatQuery, pinnedGroup],
  );
  const pinnedStorageKey = useMemo(() => getPinnedStorageKey(activeTrainer), [activeTrainer]);
  const presetStorageKey = useMemo(() => getPresetStorageKey(activeTrainer), [activeTrainer]);
  const socketReady = clientRef.current?.isOpen() ?? false;
  const connected = state.connectionStatus === EConnectionStatus.Connected;
  const controlsDisabled = Boolean(activeTrainer?.trainerLoading || activeTrainer?.isTimeLimitExpired);
  const totalVisibleCheats = filteredGroups.reduce((count, group) => count + group.cheats.length, filteredPinnedGroup?.cheats.length ?? 0);

  useEffect(() => {
    dispatch({ type: 'setPinnedTargets', pinned: loadPinnedTargets(pinnedStorageKey) });
  }, [pinnedStorageKey]);

  useEffect(() => {
    setPresets(loadPresets(presetStorageKey));
  }, [presetStorageKey]);

  useEffect(() => {
    if (state.wsUrl.trim()) {
      handleConnect();
    }
  }, []);

  function handleConnect(): void {
    clientRef.current?.disconnect();

    const wsUrl = state.wsUrl.trim();
    if (!wsUrl) {
      dispatch({ type: 'error', message: 'Enter a WebSocket URL first.' });
      return;
    }

    const nextClient = new PanelSocketClient(wsUrl, {
      onConnecting: () => dispatch({ type: 'connecting' }),
      onOpen: () => dispatch({ type: 'connected' }),
      onMessage: (message) => handleProtocolMessage(dispatch, message, trainerMetaRef.current),
      onClose: () => dispatch({ type: 'error', message: 'The WebSocket connection closed.' }),
      onError: (message) => dispatch({ type: 'error', message }),
    });

    clientRef.current = nextClient;
    nextClient.connect();
  }

  function handleDisconnect(): void {
    clientRef.current?.disconnect();
    clientRef.current = null;
    dispatch({ type: 'disconnected' });
  }

  function handleCheatChange(cheat: CheatSchema, nextValue: unknown): void {
    const normalizedValue = normalizeOutgoingValue(cheat, nextValue);
    dispatch({ type: 'setPending', target: cheat.target, pending: true });
    dispatch({ type: 'valueChanged', target: cheat.target, value: normalizedValue });

    if (state.connectionStatus !== EConnectionStatus.Connected || !state.trainerMeta || !clientRef.current) {
      dispatch({ type: 'setPending', target: cheat.target, pending: false });
      return;
    }

    const sent = clientRef.current.setValue(state.trainerMeta.trainer.trainerId, cheat.target, normalizedValue, cheat.uuid);
    if (!sent) {
      dispatch({ type: 'setPending', target: cheat.target, pending: false });
      dispatch({ type: 'error', message: 'The bridge socket is not open.' });
    }
  }

  function handleToggleCheatPin(cheat: CheatSchema): void {
    const next = { ...state.pinnedTargets };
    if (next[cheat.target]) {
      delete next[cheat.target];
    } else {
      next[cheat.target] = true;
    }

    dispatch({ type: 'togglePinnedTarget', target: cheat.target });
    savePinnedTargets(pinnedStorageKey, next);
  }

  function handleToggleGamePin(game: LibraryGame): void {
    const next = togglePinnedGame(game, pinnedGameIds);
    setPinnedGameIds(next);
    savePinnedGameIds(next);
  }

  function handleLaunchGame(app: InstalledAppSummary): void {
    const client = clientRef.current;
    if (!app.gameId) {
      dispatch({ type: 'error', message: 'This My Games entry does not expose a Wand game id.' });
      return;
    }

    if (!client?.isOpen()) {
      dispatch({ type: 'error', message: 'The bridge socket is not open.' });
      return;
    }

    if (!client.launchGame(app.gameId, app.titleId ?? undefined)) {
      dispatch({ type: 'error', message: 'Failed to send the launch command to the bridge.' });
      return;
    }

    setRightOpen(false);
  }

  function handlePlayGame(game: LibraryGame): void {
    handleLaunchGame(game.app);
  }

  function handleStopPlaying(): void {
    const client = clientRef.current;
    if (!client?.isOpen()) {
      dispatch({ type: 'error', message: 'The bridge socket is not open.' });
      return;
    }

    const activeGameId = state.gameStatus?.session.gameId ?? state.gameStatus?.trainer.gameId ?? undefined;
    const activeTitleId = state.gameStatus?.session.titleId ?? state.gameStatus?.trainer.titleId ?? undefined;
    if (!client.stopPlaying(activeGameId ?? undefined, activeTitleId ?? undefined)) {
      dispatch({ type: 'error', message: 'Failed to send the stop command to the bridge.' });
    }
  }

  function handlePanic(): void {
    if (!state.trainerMeta) {
      return;
    }

    for (const cheat of state.trainerMeta.schema.cheats) {
      if (cheat.type === ECheatType.Toggle && Boolean(state.values[cheat.target])) {
        handleCheatChange(cheat, false);
      }
    }
  }

  function handleAddPreset(name: string): boolean {
    if (!state.trainerMeta) {
      dispatch({ type: 'error', message: 'No active trainer to save as a preset.' });
      return false;
    }

    const values = capturePresetValues(state.trainerMeta.schema.cheats, state.values);
    if (Object.keys(values).length === 0) {
      dispatch({ type: 'error', message: 'There are no mod values to save yet.' });
      return false;
    }

    const nextPresets = [...presets, createPreset(name, values)];
    setPresets(nextPresets);
    savePresets(presetStorageKey, nextPresets);
    return true;
  }

  function handleApplyPreset(preset: RemotePreset): void {
    if (!state.trainerMeta) {
      return;
    }

    for (const cheat of state.trainerMeta.schema.cheats) {
      if (!(cheat.target in preset.values)) {
        continue;
      }

      handleCheatChange(cheat, preset.values[cheat.target]);
    }
  }

  function handleDeletePreset(presetId: string): void {
    const nextPresets = presets.filter((preset) => preset.id !== presetId);
    setPresets(nextPresets);
    savePresets(presetStorageKey, nextPresets);
  }

  function handleScroll(event: UIEvent<HTMLDivElement>): void {
    const y = event.currentTarget.scrollTop;
    if (y > lastScrollRef.current && y > SCROLL_HIDE_THRESHOLD_PX) {
      setHideDock(true);
    } else if (y < lastScrollRef.current - SCROLL_REVEAL_DEAD_ZONE_PX) {
      setHideDock(false);
    }

    lastScrollRef.current = y;
  }

  return (
    <main className="min-h-svh bg-[#050608] text-(--deck-fg)">
      <div className="flex min-h-svh w-full p-0">
        <section className="relative h-svh w-full overflow-hidden bg-(--deck-bg) shadow-[0_40px_100px_-20px_rgba(0,0,0,.7),0_0_0_1px_rgba(255,255,255,.06)]">
          <div className="pointer-events-none absolute -inset-12 z-0 bg-[radial-gradient(circle_at_30%_15%,color-mix(in_oklab,var(--deck-accent)_22%,transparent),transparent_45%),radial-gradient(circle_at_80%_85%,color-mix(in_oklab,var(--deck-accent)_16%,transparent),transparent_45%),radial-gradient(circle_at_20%_80%,color-mix(in_oklab,var(--deck-accent)_8%,transparent),transparent_50%)] blur-[50px]" />
          <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_0%,rgba(255,255,255,0.025),transparent)]" />
          <div className="relative z-10 flex h-full flex-col">
            <TopBar status={state.connectionStatus} currentGame={currentGame} runningTrainer={activeTrainer} onOpenSettings={() => setLeftOpen(true)} />
            <div className="remote-scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-[110px]" onScroll={handleScroll}>
              {!connected ? (
                <PlaceholderState icon="plug" title="Bridge offline" sub="Open Settings to point Wand at your trainer bridge over WebSocket." action="Open Settings" onAction={() => setLeftOpen(true)} />
              ) : !activeTrainer ? (
                <PlaceholderState icon="gamepad-variant-outline" title="Select a game" sub="No game is running yet. Open the library and launch one to start tweaking." action="Browse library" onAction={() => setRightOpen(true)} />
              ) : (
                <>
                  <TrainerHeader trainer={activeTrainer} game={currentGame} isPinned={Boolean(currentGame && pinnedGameIds[currentGame.id])} onPin={() => currentGame && handleToggleGamePin(currentGame)} />
                  <QuickActions presets={presets} onAddPreset={handleAddPreset} onApplyPreset={handleApplyPreset} onDeletePreset={handleDeletePreset} onPanic={handlePanic} />
                  <div className="sticky top-0 z-10 -mx-3.5 mb-2.5 px-3.5 py-0.5">
                    <SearchInput value={cheatQuery} placeholder="Search mods" onChange={setCheatQuery} />
                  </div>
                  {filteredPinnedGroup ? (
                    <CategorySection
                      forceOpen={Boolean(cheatQuery)}
                      group={filteredPinnedGroup}
                      values={state.values}
                      pendingTargets={state.pendingTargets}
                      pinnedTargets={state.pinnedTargets}
                      disabled={controlsDisabled}
                      onCheatChange={handleCheatChange}
                      onTogglePin={handleToggleCheatPin}
                    />
                  ) : null}
                  {filteredGroups.map((group, index) => (
                    <CategorySection
                      key={group.id}
                      forceOpen={Boolean(cheatQuery)}
                      group={group}
                      openByDefault={index < 2}
                      values={state.values}
                      pendingTargets={state.pendingTargets}
                      pinnedTargets={state.pinnedTargets}
                      disabled={controlsDisabled}
                      onCheatChange={handleCheatChange}
                      onTogglePin={handleToggleCheatPin}
                    />
                  ))}
                  {cheatQuery && totalVisibleCheats === 0 ? <p className="px-8 py-8 text-center text-[13px] text-(--deck-fg-4)">No mods match "{cheatQuery}"</p> : null}
                  <div className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-(--deck-fg-4)">
                    {cheatQuery ? `${totalVisibleCheats} matches` : `END · ${state.trainerMeta?.schema.cheats.length ?? 0} MODS`}
                  </div>
                </>
              )}
            </div>
          </div>

          <FloatingDock
            status={state.connectionStatus}
            runningGameTitle={currentGame?.title ?? null}
            hidden={hideDock}
            leftHasBadge={!connected}
            rightHasBadge={connected && !currentGame}
            onOpenSettings={() => setLeftOpen(true)}
            onOpenLibrary={() => setRightOpen(true)}
          />

          <Drawer open={leftOpen} side="left" onClose={() => setLeftOpen(false)}>
            <SettingsDrawer
              status={state.connectionStatus}
              wsUrl={state.wsUrl}
              currentGame={currentGame}
              currentTrainer={activeTrainer}
              lastError={state.lastError}
              onClose={() => setLeftOpen(false)}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onWsUrlChange={(wsUrl) => dispatch({ type: 'setWsUrl', wsUrl })}
            />
          </Drawer>
          <Drawer open={rightOpen} side="right" onClose={() => setRightOpen(false)}>
            <LibraryDrawer
              games={libraryGames}
              query={gameQuery}
              canLaunch={socketReady}
              onClose={() => setRightOpen(false)}
              onPin={handleToggleGamePin}
              onPlay={handlePlayGame}
              onStop={handleStopPlaying}
              onQueryChange={setGameQuery}
            />
          </Drawer>
        </section>
      </div>
    </main>
  );
};
