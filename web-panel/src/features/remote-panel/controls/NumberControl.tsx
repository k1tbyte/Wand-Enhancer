import { type FormEvent } from 'react';

import { cn } from '@/lib/utils';

import { formatInputNumber, numericValue, stripNumberGrouping } from './format-number';
import { StepButton, type ControlInternalProps } from './shared';

const NUMBER_STEP_GRID = 'grid-cols-[48px_minmax(0,1fr)_48px]';

export const NumberControl = ({ cheat, value, disabled, onChange }: ControlInternalProps) => {
  const step = cheat.args.step ?? 1;
  const currentValue = numericValue(value, 0);
  const handleInput = (event: FormEvent<HTMLInputElement>) => onChange(stripNumberGrouping(event.currentTarget.value));
  const decrement = () => onChange(Math.max(cheat.args.min ?? Number.NEGATIVE_INFINITY, currentValue - step));
  const increment = () => onChange(Math.min(cheat.args.max ?? Number.POSITIVE_INFINITY, currentValue + step));

  return (
    <div className={cn('grid h-[38px] w-full items-stretch overflow-hidden rounded-[10px] border border-white/10 bg-white/[0.055] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl', NUMBER_STEP_GRID)}>
      <StepButton border="right" disabled={disabled} icon="minus" onClick={decrement} />
      <input
        type="text"
        value={formatInputNumber(value)}
        disabled={disabled}
        className="min-w-0 bg-transparent px-2 text-center font-mono text-[15px] font-semibold tabular-nums text-(--deck-fg) outline-none disabled:opacity-50"
        onInput={handleInput}
      />
      <StepButton border="left" disabled={disabled} icon="plus" onClick={increment} />
    </div>
  );
};
