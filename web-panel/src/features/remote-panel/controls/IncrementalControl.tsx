import { cn } from '@/lib/utils';

import { resolveOption } from '../protocol';
import { ActionButton } from './ActionButton';
import { StepButton, type ControlInternalProps } from './shared';

const INCREMENTAL_STEP_GRID = 'grid-cols-[46px_minmax(0,1fr)_46px]';

export const IncrementalControl = ({ cheat, value, disabled, onChange }: ControlInternalProps) => {
  const options = (cheat.args.options ?? []).map(resolveOption);
  if (options.length === 0) {
    return <ActionButton cheat={cheat} disabled={disabled} value={value} onChange={onChange} />;
  }

  const currentIndex = options.findIndex((option) => isSameOption(option.value, value));
  const previous = currentIndex > 0 ? options[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < options.length - 1 ? options[currentIndex + 1] : null;
  const currentLabel = options[currentIndex]?.label ?? String(value ?? '--');

  return (
    <div className={cn('grid h-[38px] w-full items-stretch overflow-hidden rounded-[10px] border border-white/10 bg-white/[0.055] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl', INCREMENTAL_STEP_GRID)}>
      <StepButton border="right" disabled={disabled || !previous} icon="chevron-left" onClick={() => previous && onChange(previous.value)} />
      <span className="flex min-w-0 items-center justify-center truncate px-2 text-center font-mono text-[12.5px] font-semibold tabular-nums text-(--deck-fg)">
        {currentLabel}{cheat.args.postfix ?? ''}
      </span>
      <StepButton border="left" disabled={disabled || !next} icon="chevron-right" onClick={() => next && onChange(next.value)} />
    </div>
  );
};

function isSameOption(left: unknown, right: unknown): boolean {
  return String(left) === String(right);
}
