import { cn } from '@/lib/utils';

import type { ControlInternalProps } from './shared';

export const ToggleControl = ({ value, disabled, onChange }: ControlInternalProps) => {
  const checked = Boolean(value);
  const handleClick = () => onChange(!checked);

  return (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      className={cn('relative h-[26px] w-11 shrink-0 self-center rounded-full border transition-all disabled:cursor-not-allowed disabled:opacity-50', checked ? 'border-(--deck-accent) bg-[color-mix(in_oklab,var(--deck-accent)_22%,transparent)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--deck-accent)_12%,transparent)]' : 'border-white/10 bg-white/[0.05]')}
      onClick={handleClick}
    >
      <span className={cn('absolute top-0.5 size-5 rounded-full transition-all', checked ? 'left-5 bg-(--deck-accent) shadow-[0_0_8px_color-mix(in_oklab,var(--deck-accent)_50%,transparent)]' : 'left-0.5 bg-(--deck-fg-3)')} />
    </button>
  );
};
