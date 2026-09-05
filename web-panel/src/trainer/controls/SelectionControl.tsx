import { Trans } from '@lingui/react/macro';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/shared/lib/ui';
import { Icon } from '@/shared/ui/Icon';

import type { CheatOption } from '../../../protocol/messages';
import { isSameOption, resolveOption } from '../model/values';
import type { ControlInternalProps } from './shared';

export const SelectionControl = ({ cheat, value, disabled, onChange }: ControlInternalProps) => {
    const options = useMemo(
        () => (cheat.args.options ?? []).map(resolveOption),
        [cheat.args.options],
    );
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);

    // Without these the list can only be dismissed by picking something.
    useEffect(() => {
        if (!open) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    if (options.length === 0) {
        return (
            <span className="text-[12px] text-(--deck-fg-4)">
                <Trans>No options</Trans>
            </span>
        );
    }

    const selectedOption =
        options.find((option) => isSameOption(option.value, value ?? options[0].value)) ??
        options[0];
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
        <div ref={rootRef} className="w-full space-y-1.5">
            <button
                type="button"
                aria-expanded={open}
                aria-haspopup="listbox"
                disabled={disabled}
                className="flex h-[38px] w-full items-center justify-between gap-3 rounded-[10px] border border-white/10 bg-white/5.5 px-3 text-left text-[13px] font-semibold text-(--deck-fg) shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none backdrop-blur-xl disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleToggle}
            >
                <span className="min-w-0 truncate">{selectedOption.label}</span>
                <Icon
                    className={cn(
                        'size-4 shrink-0 text-(--deck-fg-3) transition-transform',
                        open ? 'rotate-180' : '',
                    )}
                    name="chevron-down"
                />
            </button>
            {open ? (
                <div
                    role="listbox"
                    aria-label={cheat.name}
                    className="overflow-hidden rounded-[10px] border border-white/10 bg-white/5.5 p-1 shadow-[0_18px_40px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
                >
                    {options.map((option) => {
                        const active = isSameOption(selectedOption.value, option.value);
                        return (
                            <button
                                key={`${cheat.uuid}-${optionKey(option)}`}
                                type="button"
                                role="option"
                                aria-selected={active}
                                className={cn(
                                    'flex h-[32px] w-full items-center justify-between rounded-[7px] px-2.5 text-left text-[12.5px] font-semibold transition-colors',
                                    active
                                        ? 'bg-white/5.5 text-(--deck-accent)'
                                        : 'text-(--deck-fg) hover:bg-white/5.5',
                                )}
                                onClick={() => handleSelect(option)}
                            >
                                <span className="min-w-0 truncate">{option.label}</span>
                                {active ? (
                                    <span className="ml-3 size-1.5 shrink-0 rounded-full bg-(--deck-accent) shadow-[0_0_6px_var(--deck-accent)]" />
                                ) : null}
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
