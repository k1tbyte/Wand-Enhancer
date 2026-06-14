import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';

import { FloatingDock } from '@/app/ui/FloatingDock';
import { SessionPlaceholder } from '@/app/ui/SessionPlaceholder';
import { SettingsDrawer } from '@/app/ui/SettingsDrawer';
import { TopBar } from '@/app/ui/TopBar';
import { LibraryDrawer } from '@/library/ui/LibraryDrawer';
import { Drawer } from '@/shared/ui/Drawer';
import { SearchInput } from '@/shared/ui/SearchInput';
import { CategorySection } from '@/trainer/ui/CategorySection';
import { QuickActions } from '@/trainer/ui/QuickActions';
import { TrainerHeader } from '@/trainer/ui/TrainerHeader';

import { useRemotePanel } from './use-remote-panel';

export const App = () => {
  const { _ } = useLingui();
  const panel = useRemotePanel();
  const { session, trainer, library, shell } = panel;

  return (
    <main className="min-h-svh bg-[#050608] text-(--deck-fg)">
      <div className="flex min-h-svh w-full p-0">
        <section className="relative h-svh w-full overflow-hidden bg-(--deck-bg) shadow-[0_40px_100px_-20px_rgba(0,0,0,.7),0_0_0_1px_rgba(255,255,255,.06)]">
          <div className="pointer-events-none absolute -inset-12 z-0 bg-[radial-gradient(circle_at_30%_15%,color-mix(in_oklab,var(--deck-accent)_22%,transparent),transparent_45%),radial-gradient(circle_at_80%_85%,color-mix(in_oklab,var(--deck-accent)_16%,transparent),transparent_45%),radial-gradient(circle_at_20%_80%,color-mix(in_oklab,var(--deck-accent)_8%,transparent),transparent_50%)]" />
          <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_0%,rgba(255,255,255,0.025),transparent)]" />
          <div className="relative z-10 flex h-full flex-col">
            <TopBar status={session.status} currentGame={library.currentGame} runningTrainer={trainer.activeTrainer} onOpenSettings={shell.openSettings} />
            <div className="remote-scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-27.5" onScroll={shell.onScroll}>
              {!session.connected || !trainer.activeTrainer ? (
                <SessionPlaceholder
                  connected={session.connected}
                  activeTrainer={trainer.activeTrainer}
                  onOpenLibrary={shell.openLibrary}
                  onOpenSettings={shell.openSettings}
                />
              ) : (
                <>
                  <TrainerHeader trainer={trainer.activeTrainer} game={library.currentGame} isPinned={Boolean(library.currentGame && library.pinnedGameIds[library.currentGame.id])} onPin={() => library.currentGame && library.togglePin(library.currentGame)} />
                  <QuickActions presets={trainer.presets} onAddPreset={trainer.addPreset} onApplyPreset={trainer.applyPreset} onDeletePreset={trainer.deletePreset} onPanic={trainer.panic} />
                  <div className="sticky top-0 z-10 -mx-3.5 mb-2.5 px-3.5 py-0.5">
                    <SearchInput value={trainer.query} placeholder={_(msg`Search mods`)} onChange={trainer.setQuery} />
                  </div>
                  {trainer.filteredPinnedGroup ? (
                    <CategorySection
                      forceOpen={Boolean(trainer.query)}
                      group={trainer.filteredPinnedGroup}
                      values={session.values}
                      pendingTargets={session.pendingTargets}
                      pinnedTargets={trainer.pinnedTargets}
                      disabled={trainer.controlsDisabled}
                      onCheatChange={trainer.changeCheat}
                      onTogglePin={trainer.togglePin}
                    />
                  ) : null}
                  {trainer.filteredGroups.map((group, index) => (
                    <CategorySection
                      key={group.id}
                      forceOpen={Boolean(trainer.query)}
                      group={group}
                      openByDefault={index < 2}
                      values={session.values}
                      pendingTargets={session.pendingTargets}
                      pinnedTargets={trainer.pinnedTargets}
                      disabled={trainer.controlsDisabled}
                      onCheatChange={trainer.changeCheat}
                      onTogglePin={trainer.togglePin}
                    />
                  ))}
                  {trainer.query && trainer.totalVisibleCheats === 0 ? <p className="px-8 py-8 text-center text-[13px] text-(--deck-fg-4)"><Trans>No mods match "{trainer.query}"</Trans></p> : null}
                  <div className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-(--deck-fg-4)">
                    {trainer.query
                      ? _(msg`${trainer.totalVisibleCheats} matches`)
                      : _(msg`END · ${trainer.totalCheats} MODS`)}
                  </div>
                </>
              )}
            </div>
          </div>

          <FloatingDock
            status={session.status}
            runningGameTitle={library.currentGame?.title ?? null}
            hidden={shell.dockHidden}
            leftHasBadge={!session.connected}
            rightHasBadge={session.connected && !library.currentGame}
            onOpenSettings={shell.openSettings}
            onOpenLibrary={shell.openLibrary}
          />

          <Drawer open={shell.leftOpen} side="left" onClose={shell.closeSettings}>
            <SettingsDrawer
              status={session.status}
              wsUrl={session.wsUrl}
              currentGame={library.currentGame}
              currentTrainer={trainer.activeTrainer}
              lastError={session.lastError}
              onClose={shell.closeSettings}
              onConnect={session.connect}
              onDisconnect={session.disconnect}
              onWsUrlChange={session.setWsUrl}
            />
          </Drawer>
          <Drawer open={shell.rightOpen} side="right" onClose={shell.closeLibrary}>
            <LibraryDrawer
              games={library.games}
              query={library.query}
              canLaunch={session.socketReady}
              onClose={shell.closeLibrary}
              onPin={library.togglePin}
              onPlay={library.playGame}
              onStop={library.stopPlaying}
              onQueryChange={library.setQuery}
            />
          </Drawer>
        </section>
      </div>
    </main>
  );
};
