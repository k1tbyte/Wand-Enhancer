import { useMemo } from 'react';

import { cn } from '@/shared/lib/ui';

import { isSameOption, resolveOption } from '../model/values';
import { ActionButton } from './ActionButton';
import { type ControlInternalProps, STEPPER_SHELL_CLASS, StepButton } from './shared';

const INCREMENTAL_STEP_GRID = 'grid-cols-[46px_minmax(0,1fr)_46px]';

export const IncrementalControl = ({ cheat, value, disabled, onChange }: ControlInternalProps) => {
    const options = useMemo(
        () => (cheat.args.options ?? []).map(resolveOption),
        [cheat.args.options],
    );
    if (options.length === 0) {
        return <ActionButton cheat={cheat} disabled={disabled} value={value} onChange={onChange} />;
    }

    const matchedIndex = options.findIndex((option) => isSameOption(option.value, value));
    // An unrecognised value must not strand the user: treat it as "before the first
    // option" so stepping forward still walks the list.
    const currentIndex = matchedIndex >= 0 ? matchedIndex : -1;
    const previous = currentIndex > 0 ? options[currentIndex - 1] : null;
    const next = currentIndex < options.length - 1 ? options[currentIndex + 1] : null;
    const currentLabel = options[currentIndex]?.label ?? String(value ?? '--');

    return (
        <div className={cn(STEPPER_SHELL_CLASS, INCREMENTAL_STEP_GRID)}>
            <StepButton
                border="right"
                disabled={disabled || !previous}
                icon="chevron-left"
                label={`Previous ${cheat.name}`}
                onClick={() => previous && onChange(previous.value)}
            />
            <span className="flex min-w-0 items-center justify-center truncate px-2 text-center font-mono text-[12.5px] font-semibold tabular-nums text-(--deck-fg)">
                {currentLabel}
                {cheat.args.postfix ?? ''}
            </span>
            <StepButton
                border="left"
                disabled={disabled || !next}
                icon="chevron-right"
                label={`Next ${cheat.name}`}
                onClick={() => next && onChange(next.value)}
            />
        </div>
    );
};
