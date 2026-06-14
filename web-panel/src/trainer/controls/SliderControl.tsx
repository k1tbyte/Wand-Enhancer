import { type FormEvent } from 'react';

import { formatNumber, numericValue } from './format-number';
import { SliderTrack, type ControlInternalProps } from './shared';

export const SliderControl = ({ cheat, value, disabled, onChange }: ControlInternalProps) => {
  const min = cheat.args.min ?? 0;
  const max = cheat.args.max ?? 100;
  const step = cheat.args.step ?? 1;
  const currentValue = numericValue(value, min);
  const handleInput = (event: FormEvent<HTMLInputElement>) => onChange(Number(event.currentTarget.value));

  return (
    <div className="w-full">
      <div className="mb-1 flex justify-end font-mono text-[12.5px] tabular-nums text-(--deck-accent)">
        {formatNumber(currentValue, step)}{cheat.args.postfix ?? ''}
      </div>
      <SliderTrack disabled={disabled} max={max} min={min} step={step} value={currentValue} onInput={handleInput} />
    </div>
  );
};
