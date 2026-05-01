import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { CheatSchema, CheatOption } from '../protocol';
import { resolveOption } from '../protocol';

type CheatControlProps = {
  cheat: CheatSchema;
  value: unknown;
  pending: boolean;
  disabled: boolean;
  onChange: (nextValue: unknown) => void;
};

function renderValue(value: unknown, postfix?: string): string {
  if (typeof value === 'boolean') {
    return value ? 'On' : 'Off';
  }

  if (value === null || value === undefined || value === '') {
    return '--';
  }

  return `${String(value)}${postfix ?? ''}`;
}

function numericValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionKey(option: CheatOption): string {
  return String(option.value);
}

function findOption(options: CheatOption[], value: string): CheatOption | undefined {
  return options.find((option) => String(option.value) === value);
}

function isSameOption(left: unknown, right: unknown): boolean {
  return String(left) === String(right);
}

export function CheatControl({ cheat, value, pending, disabled, onChange }: CheatControlProps) {
  const commonDisabled = disabled || pending;
  const options = cheat.args.options?.map(resolveOption) ?? [];

  if (cheat.type === 'toggle') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-black/20 p-3">
        <span className="text-sm font-semibold text-white">{renderValue(value)}</span>
        <Switch checked={Boolean(value)} disabled={commonDisabled} onCheckedChange={onChange} />
      </div>
    );
  }

  if (cheat.type === 'slider') {
    const min = cheat.args.min ?? 0;
    const max = cheat.args.max ?? 100;
    const currentValue = numericValue(value, min);

    return (
      <div className="space-y-3 rounded-[8px] border border-white/10 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Range</span>
          <span className="rounded-[6px] border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 font-mono text-sm text-emerald-100">
            {renderValue(currentValue, cheat.args.postfix)}
          </span>
        </div>
        <Slider
          min={min}
          max={max}
          step={cheat.args.step ?? 1}
          value={currentValue}
          disabled={commonDisabled}
          onValueChange={onChange}
        />
      </div>
    );
  }

  if (cheat.type === 'number') {
    return (
      <div className="grid grid-cols-[1fr_auto] gap-2 rounded-[8px] border border-white/10 bg-black/20 p-3">
        <Input
          type="number"
          min={cheat.args.min}
          max={cheat.args.max}
          step={cheat.args.step ?? 1}
          value={String(value ?? '')}
          disabled={commonDisabled}
          className="h-9 rounded-[8px] border-white/10 bg-white/5 text-white"
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <span className="flex min-w-16 items-center justify-center rounded-[8px] border border-amber-300/25 bg-amber-300/10 px-2 font-mono text-sm text-amber-100">
          {renderValue(value, cheat.args.postfix)}
        </span>
      </div>
    );
  }

  if (cheat.type === 'button') {
    return (
      <Button className="h-10 w-full rounded-[8px] bg-amber-300 text-black hover:bg-amber-200" disabled={commonDisabled} onClick={() => onChange(1)}>
        <Icon className="size-4" name="play" />
        {typeof cheat.args.button === 'string' ? cheat.args.button : 'Apply'}
      </Button>
    );
  }

  if (cheat.type === 'selection') {
    const selectedValue = String(value ?? options[0]?.value ?? '');

    return (
      <select
        value={selectedValue}
        disabled={commonDisabled}
        className="h-10 w-full rounded-[8px] border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
        onChange={(event) => onChange(findOption(options, event.currentTarget.value)?.value ?? event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={`${cheat.uuid}-${optionKey(option)}`} value={optionKey(option)}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (cheat.type === 'scalar') {
    return (
      <div className="grid grid-cols-2 gap-2 rounded-[8px] border border-white/10 bg-black/20 p-2 sm:grid-cols-4">
        {options.map((option) => (
          <Button
            key={`${cheat.uuid}-${optionKey(option)}`}
            className={cn('h-9 rounded-[8px] border-white/10', isSameOption(value, option.value) ? 'bg-emerald-300 text-black hover:bg-emerald-200' : 'bg-white/5 text-white hover:bg-white/10')}
            disabled={commonDisabled}
            variant={isSameOption(value, option.value) ? 'default' : 'outline'}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    );
  }

  if (cheat.type === 'incremental') {
    const currentIndex = options.findIndex((option) => isSameOption(option.value, value));
    const previous = currentIndex > 0 ? options[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < options.length - 1 ? options[currentIndex + 1] : null;

    return (
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-[8px] border border-white/10 bg-black/20 p-2">
        <Button size="icon" variant="outline" className="rounded-[8px] border-white/10 bg-white/5 text-white" disabled={commonDisabled || !previous} onClick={() => previous && onChange(previous.value)}>
          <Icon className="size-4" name="chevron-left" />
        </Button>
        <span className="truncate text-center text-sm font-semibold text-white">{renderValue(options[currentIndex]?.label ?? value)}</span>
        <Button size="icon" variant="outline" className="rounded-[8px] border-white/10 bg-white/5 text-white" disabled={commonDisabled || !next} onClick={() => next && onChange(next.value)}>
          <Icon className="size-4" name="chevron-right" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-red-300/25 bg-red-500/10 p-3 text-sm text-red-100">
      <Icon className="size-4" name="refresh" /> Unsupported cheat type: {cheat.type}
    </div>
  );
}
