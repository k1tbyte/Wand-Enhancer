import { type FormEvent } from 'react';

import type { CheatSchema } from '../protocol';
import { resolveOption } from '../protocol';
import { formatNumber, numericValue } from './format-number';
import { SliderTrack, type ControlInternalProps } from './shared';

export const ScalarControl = ({ cheat, value, disabled, onChange }: ControlInternalProps) => {
  const numericOptions = getNumericOptions(cheat.args.options ?? []);
  const min = cheat.args.min ?? numericOptions[0] ?? 0;
  const max = cheat.args.max ?? numericOptions[numericOptions.length - 1] ?? 100;
  const step = cheat.args.step ?? inferStep(numericOptions) ?? 1;
  const currentValue = numericValue(value, min);
  const handleInput = (event: FormEvent<HTMLInputElement>) => onChange(Number(event.currentTarget.value));

  return (
    <div className="w-full">
      <div className="mb-1 flex justify-end font-mono text-[12.5px] tabular-nums text-(--deck-accent)">
        {formatNumber(currentValue, step)}{cheat.args.postfix ?? ''}
      </div>
      <SliderTrack disabled={disabled} max={max} min={min} step={step} value={currentValue} onInput={handleInput} />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-(--deck-fg-4)">
        <span>{min}{cheat.args.postfix ?? ''}</span>
        <span>{max}{cheat.args.postfix ?? ''}</span>
      </div>
    </div>
  );
};

function getNumericOptions(options: NonNullable<CheatSchema['args']['options']>): number[] {
  return options
    .map(resolveOption)
    .map((option) => numericValue(option.value, Number.NaN))
    .filter((option) => Number.isFinite(option))
    .sort((left, right) => left - right);
}

function inferStep(options: number[]): number | null {
  if (options.length < 2) {
    return null;
  }

  const steps = options
    .slice(1)
    .map((option, index) => Math.abs(option - options[index]))
    .filter((option) => option > 0);

  return steps.length > 0 ? Math.min(...steps) : null;
}
