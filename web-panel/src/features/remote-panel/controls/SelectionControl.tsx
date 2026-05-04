import { useState } from 'react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import type { CheatOption } from '../protocol';
import { resolveOption } from '../protocol';
import type { ControlInternalProps } from './shared';

export const SelectionControl = ({ cheat, value, disabled, onChange }: ControlInternalProps) => {
  const options = (cheat.args.options ?? []).map(resolveOption);
  const [open, setOpen] = useState(false);
  if (options.length === 0) {
    return <span className="text-[12px] text-(--deck-fg-4)">No options</span>;
  }

  const selectedOption = findOption(options, String(value ?? options[0].value)) ?? options[0];
  const handleToggle = () => {
    if (disabled) {
      return;
    }

    setOpen((current) => !current);
  };
  const handleSelect = (option: CheatOption) => {
    onChange(option.value);
    setOpen(false);
  };

  return (
    <div className="w-full space-y-1.5">
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        className="flex h-[38px] w-full items-center justify-between gap-3 rounded-[10px] border border-white/10 bg-white/[0.055] px-3 text-left text-[13px] font-semibold text-(--deck-fg) shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-xl disabled:cursor-not-allowed disabled:opacity-50"
        onClick={handleToggle}
      >
        <span className="min-w-0 truncate">{selectedOption.label}</span>
        <Icon className={cn('size-4 shrink-0 text-(--deck-fg-3) transition-transform', open ? 'rotate-180' : '')} name="chevron-down" />
      </button>
      {open ? (
        <div className="overflow-hidden rounded-[10px] border border-white/10 bg-white/[0.055] p-1 shadow-[0_18px_40px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
          {options.map((option) => {
            const active = isSameOption(selectedOption.value, option.value);
            return (
              <button
                key={`${cheat.uuid}-${optionKey(option)}`}
                type="button"
                className={cn('flex h-[32px] w-full items-center justify-between rounded-[7px] px-2.5 text-left text-[12.5px] font-semibold transition-colors', active ? 'bg-white/[0.055] text-(--deck-accent)' : 'text-(--deck-fg) hover:bg-white/[0.055]')}
                onClick={() => handleSelect(option)}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {active ? <span className="ml-3 size-1.5 shrink-0 rounded-full bg-(--deck-accent) shadow-[0_0_6px_var(--deck-accent)]" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

function optionKey(option: CheatOption): string {
  return String(option.value);
}

function findOption(options: CheatOption[], value: string): CheatOption | undefined {
  return options.find((option) => String(option.value) === value);
}

function isSameOption(left: unknown, right: unknown): boolean {
  return String(left) === String(right);
}
