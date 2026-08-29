import type { FormEvent } from 'react';
import { cn } from '@/shared/lib/ui';
import { Icon } from '@/shared/ui/Icon';

import type { CheatSchema } from '../../../protocol/messages';
import { formatNumber } from './format-number';

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
    onInput: (event: FormEvent<HTMLInputElement>) => void;
};

export const SliderTrack = ({
    min,
    max,
    step,
    value,
    label,
    disabled,
    onInput,
}: SliderTrackProps) => {
    const pct = max === min ? 0 : Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

    return (
        <div className="relative flex h-5 w-full items-center">
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
                className="remote-range w-full"
                onInput={onInput}
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
    onInput: (event: FormEvent<HTMLInputElement>) => void;
};

export const SliderReadout = ({
    value,
    min,
    max,
    step,
    postfix,
    label,
    disabled,
    onInput,
}: SliderReadoutProps) => {
    return (
        <>
            <div className="mb-1 flex justify-end font-mono text-[12.5px] tabular-nums text-(--deck-accent)">
                {formatNumber(value, step)}
                {postfix}
            </div>
            <SliderTrack
                disabled={disabled}
                label={label}
                max={max}
                min={min}
                step={step}
                value={value}
                onInput={onInput}
            />
        </>
    );
};
