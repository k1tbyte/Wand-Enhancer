import { cn } from '@/shared/lib/ui';

import { Icon, type IconName } from './Icon';

type IconButtonSize = 'sm' | 'md' | 'lg';

type IconButtonProps = {
    icon: IconName;
    /** Required: an icon-only button has no other accessible name. */
    label: string;
    size?: IconButtonSize;
    active?: boolean;
    danger?: boolean;
    accent?: boolean;
    disabled?: boolean;
    shrink?: boolean;
    className?: string;
    onClick: () => void;
};

const SIZE_CLASS: Record<IconButtonSize, string> = {
    sm: 'size-7.5 rounded-[7px]',
    md: 'size-8 rounded-[8px]',
    lg: 'size-[34px] rounded-[9px]',
};

const ICON_SIZE_CLASS: Record<IconButtonSize, string> = {
    sm: 'size-3.5',
    md: 'size-4',
    lg: 'size-4',
};

export const IconButton = ({
    icon,
    label,
    size = 'md',
    active = false,
    danger = false,
    accent = false,
    disabled = false,
    shrink = false,
    className,
    onClick,
}: IconButtonProps) => {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={active || undefined}
            disabled={disabled}
            className={cn(
                'remote-glass-control flex items-center justify-center border text-(--deck-fg-2)',
                SIZE_CLASS[size],
                shrink && 'shrink-0',
                !disabled && !active && !danger && !accent && 'hover:text-(--deck-fg)',
                disabled && 'cursor-not-allowed opacity-40',
                active &&
                    'border-[color-mix(in_oklab,var(--deck-accent)_38%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_16%,transparent)] text-(--deck-accent) shadow-[0_0_14px_-6px_var(--deck-accent)]',
                accent &&
                    'bg-[color-mix(in_oklab,var(--deck-accent)_15%,transparent)] text-(--deck-accent) ring-1 ring-[color-mix(in_oklab,var(--deck-accent)_35%,transparent)]',
                danger && 'bg-red-500/15 text-red-300 ring-1 ring-red-400/30',
                className,
            )}
            onClick={onClick}
        >
            <Icon
                className={cn(
                    ICON_SIZE_CLASS[size],
                    active && 'drop-shadow-[0_0_5px_var(--deck-accent)]',
                )}
                name={icon}
            />
        </button>
    );
};
