import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import type { ConnectionStatus } from '../state';

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  idle: 'Standby',
  connecting: 'Linking',
  connected: 'Live',
  error: 'Fault',
};

const STATUS_CLASSES: Record<ConnectionStatus, string> = {
  idle: 'border-amber-300/30 bg-amber-500/10 text-amber-200',
  connecting: 'border-sky-300/30 bg-sky-500/10 text-sky-200',
  connected: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-200',
  error: 'border-red-300/30 bg-red-500/10 text-red-200',
};

export function DeckHeader({ connectionStatus, remoteUrl }: { connectionStatus: ConnectionStatus; remoteUrl: string }) {
  return (
    <header className="flex flex-col gap-4 rounded-[8px] border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-black/30 backdrop-blur md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-[8px] border border-emerald-300/30 bg-emerald-300/10 text-emerald-200 shadow-lg shadow-emerald-500/10">
          <Icon className="size-6" name="shield-bolt" stroke={1.7} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-normal text-white">Wand Control Deck</h1>
            <Badge className="border border-lime-300/30 bg-lime-300/10 text-lime-200" variant="outline">
              beta
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Icon className="size-3.5" name="wifi" /> local link</span>
            <span className="text-white/20">/</span>
            <span className="inline-flex min-w-0 items-center gap-1"><Icon className="size-3.5" name="plug" /> <span className="truncate">{remoteUrl.replace(/\/$/, '')}</span></span>
          </div>
        </div>
      </div>

      <div className={cn('flex w-fit items-center gap-2 rounded-[8px] border px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em]', STATUS_CLASSES[connectionStatus])}>
        <Icon className="size-4" name="activity" />
        {STATUS_LABELS[connectionStatus]}
      </div>
    </header>
  );
}
