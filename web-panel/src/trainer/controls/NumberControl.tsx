import { type FormEvent, useState } from 'react';

import { cn } from '@/shared/lib/ui';

import { formatInputNumber, numericValue, stripNumberGrouping } from './format-number';
import { type ControlInternalProps, STEPPER_SHELL_CLASS, StepButton } from './shared';
import { snapToStep } from './step';

const NUMBER_STEP_GRID = 'grid-cols-[48px_minmax(0,1fr)_48px]';

export const NumberControl = ({ cheat, value, disabled, onChange }: ControlInternalProps) => {
    const step = cheat.args.step ?? 1;
    const currentValue = numericValue(value, 0);
    // While focused the raw text is authoritative, otherwise formatting would eat the
    // decimal point in "0." and re-group digits under the caret as the user types.
    const [draft, setDraft] = useState<string | null>(null);

    const handleInput = (event: FormEvent<HTMLInputElement>) => {
        const raw = event.currentTarget.value;
        setDraft(raw);
        onChange(stripNumberGrouping(raw));
    };

    const commit = (next: number) => {
        setDraft(null);
        onChange(next);
    };

    const decrement = () =>
        commit(
            snapToStep(
                Math.max(cheat.args.min ?? Number.NEGATIVE_INFINITY, currentValue - step),
                step,
            ),
        );
    const increment = () =>
        commit(
            snapToStep(
                Math.min(cheat.args.max ?? Number.POSITIVE_INFINITY, currentValue + step),
                step,
            ),
        );

    return (
        <div className={cn(STEPPER_SHELL_CLASS, NUMBER_STEP_GRID)}>
            <StepButton
                border="right"
                disabled={disabled}
                icon="minus"
                label={`Decrease ${cheat.name}`}
                onClick={decrement}
            />
            <input
                type="text"
                inputMode="decimal"
                aria-label={cheat.name}
                value={draft ?? formatInputNumber(value)}
                disabled={disabled}
                className="min-w-0 bg-transparent px-2 text-center font-mono text-[15px] font-semibold tabular-nums text-(--deck-fg) outline-none disabled:opacity-50"
                onInput={handleInput}
                onBlur={() => setDraft(null)}
            />
            <StepButton
                border="left"
                disabled={disabled}
                icon="plus"
                label={`Increase ${cheat.name}`}
                onClick={increment}
            />
        </div>
    );
};
