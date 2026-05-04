import { useState, type FormEvent } from 'react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import { DEFAULT_ACCENT_COLOR, loadAccentColor, setAccentColor } from '../accent-storage';
import { DEFAULT_REMOTE_PORT } from '../constants';
import type { LibraryGame } from '../game-library';
import type { TrainerSummary } from '../protocol';
import { EConnectionStatus } from '../state';
import { StatusPill } from './StatusPill';

const ACCENT_OPTIONS = [
  { value: '#3B82F6', label: 'Cobalt', swatchClass: 'bg-[#3B82F6]' },
  { value: DEFAULT_ACCENT_COLOR, label: 'Cyan', swatchClass: 'bg-[#00FFD5]' },
  { value: '#FF2E63', label: 'Crimson', swatchClass: 'bg-[#FF2E63]' },
  { value: '#A78BFA', label: 'Violet', swatchClass: 'bg-[#A78BFA]' },
  { value: '#7CFF5B', label: 'Lime', swatchClass: 'bg-[#7CFF5B]' },
  { value: '#FFB12E', label: 'Amber', swatchClass: 'bg-[#FFB12E]' },
  { value: '#ee00ff', label: 'Magenta', swatchClass: 'bg-[#ee00ff]' },
];

type SettingsDrawerProps = {
  status: EConnectionStatus;
  wsUrl: string;
  currentGame: LibraryGame | null;
  currentTrainer: TrainerSummary | null;
  lastError: string | null;
  onClose: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onWsUrlChange: (value: string) => void;
};

export const SettingsDrawer = ({
  status,
  wsUrl,
  currentGame,
  currentTrainer,
  lastError,
  onClose,
  onConnect,
  onDisconnect,
  onWsUrlChange,
}: SettingsDrawerProps) => {
  return (
    <div className="flex h-full flex-col">
      <header className="remote-glass-header flex items-center justify-between border-b px-3.5 py-3.5">
        <div>
          <h2 className="text-lg font-bold text-(--deck-fg)">Settings</h2>
          <p className="mt-0.5 font-mono text-[11px] text-(--deck-fg-4)">wand remote · port {DEFAULT_REMOTE_PORT}</p>
        </div>
        <button type="button" aria-label="Close settings" className="remote-glass-control flex size-8 items-center justify-center rounded-[8px] border text-(--deck-fg-2) hover:text-(--deck-fg)" onClick={onClose}>
          <Icon className="size-4" name="x" />
        </button>
      </header>
      <div className="remote-scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain p-3.5">
        <BridgeControl status={status} wsUrl={wsUrl} onConnect={onConnect} onDisconnect={onDisconnect} onWsUrlChange={onWsUrlChange} />
        {lastError ? <ErrorPanel message={lastError} /> : null}

        <SectionHeader title="Session" />
        <SessionPanel currentGame={currentGame} currentTrainer={currentTrainer} />

        <SectionHeader title="Accent Color" />
        <AccentPicker />
      </div>
    </div>
  );
};

type BridgeControlProps = {
  status: EConnectionStatus;
  wsUrl: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onWsUrlChange: (value: string) => void;
};

const BridgeControl = ({ status, wsUrl, onConnect, onDisconnect, onWsUrlChange }: BridgeControlProps) => {
  const live = status === EConnectionStatus.Connected;
  const connecting = status === EConnectionStatus.Connecting;
  const handleInput = (event: FormEvent<HTMLInputElement>) => onWsUrlChange(event.currentTarget.value);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--deck-fg-4)">Bridge</h3>
        <StatusPill status={status} />
      </div>
      <div className="remote-glass-control flex h-10 items-stretch overflow-hidden rounded-[10px] border">
        <input
          value={wsUrl}
          placeholder={`ws://127.0.0.1:${DEFAULT_REMOTE_PORT}/remote/ws`}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-3 font-mono text-[12.5px] text-(--deck-fg) outline-none placeholder:text-(--deck-fg-4)"
          onInput={handleInput}
        />
        <button
          type="button"
          disabled={connecting}
          className={cn('px-4 text-[11px] font-bold tracking-[0.08em] disabled:cursor-wait disabled:opacity-70', live ? 'bg-red-500/15 text-red-300' : 'bg-(--deck-accent) text-black')}
          onClick={live ? onDisconnect : onConnect}
        >
          {getBridgeButtonLabel(status)}
        </button>
      </div>
    </section>
  );
};

const ErrorPanel = ({ message }: { message: string }) => {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-red-400/25 bg-red-500/10 p-3 text-[12px] leading-5 text-red-100">
      <Icon className="mt-0.5 size-3.5 shrink-0" name="alert" />
      <span>{message}</span>
    </div>
  );
};

const SessionPanel = ({ currentGame, currentTrainer }: { currentGame: LibraryGame | null; currentTrainer: TrainerSummary | null }) => {
  if (!currentGame) {
    return <div className="remote-glass-control rounded-[10px] border p-3 text-[12px] text-(--deck-fg-3)">No active game session.</div>;
  }

  const subtitleBase = currentTrainer?.displayName ?? currentGame.platform;
  const subtitleVersion = currentTrainer?.gameVersion ? ` · v${currentTrainer.gameVersion}` : '';
  const sessionSubtitle = `${subtitleBase}${subtitleVersion}`;

  return (
    <div className="remote-glass-control rounded-[10px] border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-(--deck-accent) shadow-[0_0_6px_var(--deck-accent)]" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-(--deck-accent)">Active Session</span>
      </div>
      <h3 className="truncate text-sm font-semibold text-(--deck-fg)">{currentGame.title}</h3>
      <p className="mt-0.5 truncate font-mono text-[11px] text-(--deck-fg-3)">
        {sessionSubtitle}
      </p>
    </div>
  );
};

const AccentPicker = () => {
  const [current, setCurrent] = useState(loadAccentColor);

  const applyAccent = (value: string) => {
    setCurrent(setAccentColor(value));
  };

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {ACCENT_OPTIONS.map((option) => {
          const active = current.toLowerCase() === option.value.toLowerCase();
          return (
            <button key={option.value} type="button" className={cn('remote-glass-control flex items-center gap-1.5 rounded-[9px] border px-2 py-2 text-[12px] font-medium', active ? 'border-(--deck-accent) text-(--deck-fg)' : 'text-(--deck-fg-3)')} onClick={() => applyAccent(option.value)}>
              <span className={cn('size-3.5 shrink-0 rounded-lg border border-white/10', option.swatchClass)} />
              {option.label}
            </button>
          );
        })}
      </div>
      <label className="remote-glass-control flex h-9.5 items-center gap-2 rounded-[9px] border px-2.5">
        <span className="flex-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-(--deck-fg-3)">Custom</span>
        <span className="font-mono text-[11px] text-(--deck-fg-4)">{current}</span>
        <input type="color" value={current} className="size-5 rounded border-0 bg-transparent p-0" onChange={(event) => applyAccent(event.currentTarget.value)} />
      </label>
    </div>
  );
};

const SectionHeader = ({ title }: { title: string }) => {
  return (
    <div className="flex items-center gap-2 pb-1.5 pt-4">
      <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--deck-fg-4)">{title}</h3>
      <div className="h-px flex-1 bg-white/6" />
    </div>
  );
};

function getBridgeButtonLabel(status: EConnectionStatus): string {
  if (status === EConnectionStatus.Connected) {
    return 'STOP';
  }

  if (status === EConnectionStatus.Connecting) {
    return '...';
  }

  return 'GO';
}
