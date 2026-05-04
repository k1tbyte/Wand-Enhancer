import { type FormEvent } from 'react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import type { CheatSchema } from '../protocol';

export type ControlInternalProps = {
  cheat: CheatSchema;
  value: unknown;
  disabled: boolean;
  onChange: (nextValue: unknown) => void;
};

type SliderTrackProps = {
  min: number;
  max: number;
  step: number;
  value: number;
  disabled: boolean;
  onInput: (event: FormEvent<HTMLInputElement>) => void;
};

export const SliderTrack = ({ min, max, step, value, disabled, onInput }: SliderTrackProps) => {
  const pct = max === min ? 0 : Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <div className="relative flex h-5 w-full items-center">
      <div className="pointer-events-none absolute inset-x-0 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--deck-accent)_60%,transparent),var(--deck-accent))]" style={{ width: `${pct}%` }} />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        className="remote-range w-full"
        onInput={onInput}
      />
    </div>
  );
};

type StepButtonProps = {
  icon: 'minus' | 'plus' | 'chevron-left' | 'chevron-right';
  border: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
};

export const StepButton = ({ icon, border, disabled, onClick }: StepButtonProps) => {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn('flex items-center justify-center bg-white/[0.025] text-(--deck-fg-2) transition-colors hover:bg-white/[0.06] hover:text-(--deck-fg) disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/[0.025] disabled:hover:text-(--deck-fg-2)', border === 'right' ? 'border-r border-white/10' : 'border-l border-white/10')}
      onClick={onClick}
    >
      <Icon className="size-4" name={icon} stroke={2} />
    </button>
  );
};
