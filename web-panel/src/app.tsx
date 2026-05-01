import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CategorySection } from '@/features/remote-panel/components/CategorySection';
import { ConnectionPanel } from '@/features/remote-panel/components/ConnectionPanel';
import { DeckHeader } from '@/features/remote-panel/components/DeckHeader';
import { EmptyDeck } from '@/features/remote-panel/components/EmptyDeck';
import { TrainerOverview } from '@/features/remote-panel/components/TrainerOverview';
import { buildPinnedGroup, filterGroups, groupCheatsByCategory } from '@/features/remote-panel/category';
import { handleProtocolMessage } from '@/features/remote-panel/message-handler';
import { normalizeOutgoingValue, type CheatSchema, type TrainerMetaPayload } from '@/features/remote-panel/protocol';
import {
  getPinnedStorageKey,
  loadPinnedTargets,
  savePinnedTargets,
} from '@/features/remote-panel/pinned-storage';
import { PanelSocketClient } from '@/features/remote-panel/socket-client';
import { createInitialPanelState, panelReducer } from '@/features/remote-panel/state';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';

export function App() {
  const [state, dispatch] = useReducer(panelReducer, createInitialPanelState());
  const [searchQuery, setSearchQuery] = useState('');
  const clientRef = useRef<PanelSocketClient | null>(null);
  const trainerMetaRef = useRef<TrainerMetaPayload | null>(state.trainerMeta);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    trainerMetaRef.current = state.trainerMeta;
  }, [state.trainerMeta]);

  const groups = useMemo(() => groupCheatsByCategory(state.trainerMeta), [state.trainerMeta]);
  const pinnedGroup = useMemo(
    () => buildPinnedGroup(state.trainerMeta, state.pinnedTargets),
    [state.trainerMeta, state.pinnedTargets],
  );
  const filteredGroups = useMemo(() => filterGroups(groups, searchQuery), [groups, searchQuery]);
  const filteredPinnedGroup = useMemo(
    () => (pinnedGroup ? filterGroups([pinnedGroup], searchQuery)[0] ?? null : null),
    [pinnedGroup, searchQuery],
  );
  const pinnedStorageKey = useMemo(
    () => getPinnedStorageKey(state.trainerMeta?.trainer ?? null),
    [state.trainerMeta?.trainer],
  );
  const activeTrainer = state.trainerMeta?.trainer ?? null;
  const cheatCount = state.trainerMeta?.schema.cheats.length ?? 0;
  const controlsDisabled = Boolean(activeTrainer?.trainerLoading || activeTrainer?.isTimeLimitExpired);

  useEffect(() => {
    dispatch({ type: 'setPinnedTargets', pinned: loadPinnedTargets(pinnedStorageKey) });
  }, [pinnedStorageKey]);

  function connect(): void {
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

  function handleCheatChange(cheat: CheatSchema, nextValue: unknown): void {
    const normalizedValue = normalizeOutgoingValue(cheat, nextValue);
    dispatch({ type: 'setPending', target: cheat.target, pending: true });
    dispatch({ type: 'valueChanged', target: cheat.target, value: normalizedValue });

    if (state.connectionStatus !== 'connected' || !state.trainerMeta || !clientRef.current) {
      dispatch({ type: 'setPending', target: cheat.target, pending: false });
      return;
    }

    const sent = clientRef.current.setValue(state.trainerMeta.trainer.trainerId, cheat.target, normalizedValue, cheat.uuid);
    if (!sent) {
      dispatch({ type: 'setPending', target: cheat.target, pending: false });
      dispatch({ type: 'error', message: 'The bridge socket is not open.' });
    }
  }

  function handleTogglePin(cheat: CheatSchema): void {
    const next = { ...state.pinnedTargets };
    if (next[cheat.target]) {
      delete next[cheat.target];
    } else {
      next[cheat.target] = true;
    }
    dispatch({ type: 'togglePinnedTarget', target: cheat.target });
    savePinnedTargets(pinnedStorageKey, next);
  }

  async function loadDebugSession(): Promise<void> {
    if (!import.meta.env.DEV) {
      return;
    }

    clientRef.current?.disconnect();
    const debugSession = await import('@/features/remote-panel/debug-session');
    debugSession.loadDebugSession(dispatch);
  }

  useEffect(() => {
    if (import.meta.env.DEV) {
      void import('@/features/remote-panel/debug-session').then((debugSession) => {
        if (debugSession.isDebugSessionRequested()) {
          debugSession.loadDebugSession(dispatch);
          return;
        }

        if (state.wsUrl.trim()) {
          connect();
        }
      });
      return;
    }

    if (!state.wsUrl.trim()) {
      return;
    }

    connect();
  }, []);

  return (
    <main className="min-h-svh overflow-hidden bg-background px-2 py-2 text-foreground sm:px-5 sm:py-3 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:gap-4">
        <DeckHeader connectionStatus={state.connectionStatus} remoteUrl={state.remoteUrl} />

        <div className="grid gap-3 sm:gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-3 sm:space-y-4">
            <ConnectionPanel
              status={state.connectionStatus}
              wsUrl={state.wsUrl}
              lastError={state.lastError}
              onConnect={connect}
              onDebugSession={import.meta.env.DEV ? loadDebugSession : undefined}
              onWsUrlChange={(wsUrl) => dispatch({ type: 'setWsUrl', wsUrl })}
            />
          </aside>

          <section className="space-y-4 sm:space-y-5">
            {activeTrainer ? (
              <>
                <TrainerOverview trainer={activeTrainer} cheatCount={cheatCount} categoryCount={groups.length} />
                <div className="relative">
                  <Icon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" name="search" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onInput={(event) => setSearchQuery((event.target as HTMLInputElement).value)}
                    placeholder="Search cheats, categories, targets..."
                    className="h-9 pl-8 pr-8 text-sm"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-white"
                    >
                      <Icon className="size-3.5" name="x" />
                    </button>
                  ) : null}
                </div>
                <div className="space-y-4 sm:space-y-7">
                  {filteredPinnedGroup ? (
                    <CategorySection
                      key="__pinned__"
                      group={filteredPinnedGroup}
                      values={state.values}
                      pendingTargets={state.pendingTargets}
                      pinnedTargets={state.pinnedTargets}
                      disabled={controlsDisabled}
                      onCheatChange={handleCheatChange}
                      onTogglePin={handleTogglePin}
                    />
                  ) : null}
                  {filteredGroups.map((group) => (
                    <CategorySection
                      key={group.id}
                      group={group}
                      values={state.values}
                      pendingTargets={state.pendingTargets}
                      pinnedTargets={state.pinnedTargets}
                      disabled={controlsDisabled}
                      onCheatChange={handleCheatChange}
                      onTogglePin={handleTogglePin}
                    />
                  ))}
                  {searchQuery && filteredGroups.length === 0 && !filteredPinnedGroup ? (
                    <p className="rounded-[8px] border border-white/10 bg-white/4.5 px-3 py-4 text-center text-sm text-muted-foreground">
                      No cheats match "{searchQuery}".
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <EmptyDeck />
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
