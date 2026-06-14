import { useState, type FormEvent } from 'react';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';

import { Icon } from '@/shared/ui/Icon';
import { cn } from '@/shared/lib/ui';
import { activateLocale, type LocaleCode, SUPPORTED_LOCALES } from '@/app/i18n';
import { DEFAULT_ACCENT_COLOR, loadAccentColor, setAccentColor } from '@/appearance/appearance-storage';
import type { LibraryGame } from '@/library/model/games';
import { EConnectionStatus } from '@/remote-session/remote-session.reducer';
import { WEB_CONTRACT } from '../../../protocol/contract';
import type { TrainerSummary } from '../../../protocol/messages';

import { StatusPill } from './StatusPill';

const ACCENT_OPTIONS: { value: string; label: MessageDescriptor; swatchClass: string }[] = [
  { value: '#3B82F6', label: msg`Cobalt`, swatchClass: 'bg-[#3B82F6]' },
  { value: DEFAULT_ACCENT_COLOR, label: msg`Cyan`, swatchClass: 'bg-[#00FFD5]' },
  { value: '#FF2E63', label: msg`Crimson`, swatchClass: 'bg-[#FF2E63]' },
  { value: '#A78BFA', label: msg`Violet`, swatchClass: 'bg-[#A78BFA]' },
  { value: '#7CFF5B', label: msg`Lime`, swatchClass: 'bg-[#7CFF5B]' },
  { value: '#FFB12E', label: msg`Amber`, swatchClass: 'bg-[#FFB12E]' },
  { value: '#ee00ff', label: msg`Magenta`, swatchClass: 'bg-[#ee00ff]' },
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
  const { _ } = useLingui();

  return (
    <div className="flex h-full flex-col">
      <header className="remote-glass-header flex items-center justify-between border-b px-3.5 py-3.5">
        <div>
          <h2 className="text-lg font-bold text-(--deck-fg)">
            <Trans>Settings</Trans>
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-(--deck-fg-4)">
            <Trans>wand remote · port {WEB_CONTRACT.defaultRemotePort}</Trans>
          </p>
        </div>
        <button type="button" aria-label={_(msg`Close settings`)} className="remote-glass-control flex size-8 items-center justify-center rounded-[8px] border text-(--deck-fg-2) hover:text-(--deck-fg)" onClick={onClose}>
          <Icon className="size-4" name="x" />
        </button>
      </header>
      <div className="remote-scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain p-3.5">
        <BridgeControl status={status} wsUrl={wsUrl} onConnect={onConnect} onDisconnect={onDisconnect} onWsUrlChange={onWsUrlChange} />
        {lastError ? <ErrorPanel message={lastError} /> : null}

        <SectionHeader title={_(msg`Session`)} />
        <SessionPanel currentGame={currentGame} currentTrainer={currentTrainer} />

        <SectionHeader title={_(msg`Language`)} />
        <LanguagePicker />

        <SectionHeader title={_(msg`Accent Color`)} />
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
  const { _ } = useLingui();
  const live = status === EConnectionStatus.Connected;
  const connecting = status === EConnectionStatus.Connecting || status === EConnectionStatus.Reconnecting;
  const handleInput = (event: FormEvent<HTMLInputElement>) => onWsUrlChange(event.currentTarget.value);
  const buttonLabel = connecting ? '...' : _(live ? msg`STOP` : msg`GO`);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-(--deck-fg-4)">
          <Trans>Bridge</Trans>
        </h3>
        <StatusPill status={status} />
      </div>
      <div className="remote-glass-control flex h-10 items-stretch overflow-hidden rounded-[10px] border">
        <input
          value={wsUrl}
          placeholder={`ws://127.0.0.1:${WEB_CONTRACT.defaultRemotePort}${WEB_CONTRACT.webSocketPath}`}
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
          {buttonLabel}
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
    return (
      <div className="remote-glass-control rounded-[10px] border p-3 text-[12px] text-(--deck-fg-3)">
        <Trans>No active game session.</Trans>
      </div>
    );
  }

  const subtitleBase = currentTrainer?.displayName ?? currentGame.platform;
  const subtitleVersion = currentTrainer?.gameVersion ? ` · v${currentTrainer.gameVersion}` : '';
  const sessionSubtitle = `${subtitleBase}${subtitleVersion}`;

  return (
    <div className="remote-glass-control rounded-[10px] border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-(--deck-accent) shadow-[0_0_6px_var(--deck-accent)]" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-(--deck-accent)">
          <Trans>Active Session</Trans>
        </span>
      </div>
      <h3 className="truncate text-sm font-semibold text-(--deck-fg)">{currentGame.title}</h3>
      <p className="mt-0.5 truncate font-mono text-[11px] text-(--deck-fg-3)">
        {sessionSubtitle}
      </p>
    </div>
  );
};

const LanguagePicker = () => {
  const { i18n } = useLingui();

  const handleSelect = (locale: LocaleCode) => {
    void activateLocale(locale);
  };

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {SUPPORTED_LOCALES.map(({ code, label }) => {
        const active = i18n.locale === code;
        return (
          <button
            key={code}
            type="button"
            className={cn('remote-glass-control flex items-center justify-center rounded-[9px] border px-2 py-2 text-[12px] font-medium', active ? 'border-(--deck-accent) text-(--deck-fg)' : 'text-(--deck-fg-3)')}
            onClick={() => handleSelect(code)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};

const AccentPicker = () => {
  const { _ } = useLingui();
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
              {_(option.label)}
            </button>
          );
        })}
      </div>
      <label className="remote-glass-control flex h-9.5 items-center gap-2 rounded-[9px] border px-2.5">
        <span className="flex-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-(--deck-fg-3)">
          <Trans>Custom</Trans>
        </span>
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
