import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { EConnectionStatus } from '../state';

const STATUS_LABELS: Record<EConnectionStatus, string> = {
  [EConnectionStatus.Connected]: 'LIVE',
  [EConnectionStatus.Connecting]: 'LINKING',
  [EConnectionStatus.Error]: 'OFFLINE',
  [EConnectionStatus.Idle]: 'OFFLINE',
};

const STATUS_CLASSES: Record<EConnectionStatus, string> = {
  [EConnectionStatus.Connected]: 'border-[color-mix(in_oklab,var(--deck-accent)_30%,transparent)] text-(--deck-accent)',
  [EConnectionStatus.Connecting]: 'border-amber-300/30 text-amber-300',
  [EConnectionStatus.Error]: 'border-white/10 text-(--deck-fg-4)',
  [EConnectionStatus.Idle]: 'border-white/10 text-(--deck-fg-4)',
};

export const StatusPill = ({ status }: { status: EConnectionStatus }) => {
  const live = status === EConnectionStatus.Connected || status === EConnectionStatus.Connecting;

  return (
    <div className={cn('inline-flex items-center gap-1.5 rounded-full border bg-white/[0.04] px-2.5 py-1 font-mono text-[9.5px] font-bold tracking-[0.12em] backdrop-blur-md', STATUS_CLASSES[status])}>
      {live ? <span className="size-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor] motion-safe:animate-[breathe_1.6s_ease-in-out_infinite]" /> : null}
      {STATUS_LABELS[status]}
      {status === EConnectionStatus.Error ? <Icon className="size-3" name="alert" /> : null}
    </div>
  );
};
