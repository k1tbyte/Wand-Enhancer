import { useState } from 'react';
import { cn } from '@/shared/lib/ui';
import { Icon } from '@/shared/ui/Icon';

import type { CheatSchema } from '../../../protocol/messages';
import { formatInputNumber, stripNumberGrouping } from './format-number';
import { clampToStep, decimalPlaces } from './step';
import { useSliderGesture } from './use-slider-gesture';

export type ControlInternalProps = {
    cheat: CheatSchema;
    value: unknown;
    disabled: boolean;
    onChange: (nextValue: unknown) => void;
};

export const STEPPER_SHELL_CLASS =
    'grid h-[38px] w-full items-stretch overflow-hidden rounded-[10px] border border-white/10 bg-white/5.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl';

type SliderTrackProps = {
    min: number;
    max: number;
    step: number;
    value: number;
    label: string;
    disabled: boolean;
    onChange: (value: number) => void;
};

export const SliderTrack = ({
    min,
    max,
    step,
    value,
    label,
    disabled,
    onChange,
}: SliderTrackProps) => {
    const pct = max === min ? 0 : Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
    const gesture = useSliderGesture(value, min, max, step, disabled, onChange);

    return (
        <div className="relative flex h-9 w-full items-center touch-pan-y" {...gesture}>
            <div className="pointer-events-none absolute inset-x-0 h-1 overflow-hidden rounded-full bg-white/6">
                <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--deck-accent)_60%,transparent),var(--deck-accent))]"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <input
                type="range"
                aria-label={label}
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                className="remote-range pointer-events-none w-full"
                onInput={(event) => onChange(Number(event.currentTarget.value))}
            />
        </div>
    );
};

type StepButtonProps = {
    icon: 'minus' | 'plus' | 'chevron-left' | 'chevron-right';
    border: 'left' | 'right';
    /** Required: the button renders an icon only, so it has no other accessible name. */
    label: string;
    disabled: boolean;
    onClick: () => void;
};

export const StepButton = ({ icon, border, label, disabled, onClick }: StepButtonProps) => {
    return (
        <button
            type="button"
            aria-label={label}
            disabled={disabled}
            className={cn(
                'flex items-center justify-center bg-white/2.5 text-(--deck-fg-2) transition-colors hover:bg-white/6 hover:text-(--deck-fg) disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/2.5 disabled:hover:text-(--deck-fg-2)',
                border === 'right' ? 'border-r border-white/10' : 'border-l border-white/10',
            )}
            onClick={onClick}
        >
            <Icon className="size-4" name={icon} stroke={2} />
        </button>
    );
};

type SliderReadoutProps = {
    value: number;
    min: number;
    max: number;
    step: number;
    postfix: string;
    label: string;
    disabled: boolean;
    onChange: (value: number) => void;
};

export const SliderReadout = ({
    value,
    min,
    max,
    step,
    postfix,
    label,
    disabled,
    onChange,
}: SliderReadoutProps) => {
    const [draft, setDraft] = useState<string | null>(null);
    const displayPrecision = Math.max(decimalPlaces(min), decimalPlaces(max), decimalPlaces(step));
    const commit = () => {
        if (draft === null) return;
        const raw = stripNumberGrouping(draft);
        const next = Number(raw);
        setDraft(null);
        if (raw && Number.isFinite(next)) onChange(clampToStep(next, min, max, step));
    };

    return (
        <div className="flex w-full items-center gap-3">
            <SliderTrack
                disabled={disabled}
                label={label}
                max={max}
                min={min}
                step={step}
                value={value}
                onChange={onChange}
            />
            <div className="relative flex h-9 w-24 shrink-0 items-center rounded-lg border border-white/10 bg-white/5 px-2 font-mono text-sm text-(--deck-accent)">
                <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`${label} value`}
                    disabled={disabled}
                    value={draft ?? formatInputNumber(value, displayPrecision)}
                    className="min-w-0 w-full bg-transparent text-center tabular-nums outline-none disabled:opacity-50"
                    onInput={(event) => setDraft(event.currentTarget.value)}
                    onBlur={commit}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') commit();
                        if (event.key === 'Escape') {
                            event.stopPropagation();
                            setDraft(null);
                        }
                    }}
                />
                {postfix && (
                    <span className="pointer-events-none absolute right-2 text-[11px] text-(--deck-fg-3)">
                        {postfix}
                    </span>
                )}
            </div>
        </div>
    );
};
