import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import type { CheatSchema } from '../protocol';
import { CheatControl } from '../controls/CheatControl';

type CheatTileProps = {
  cheat: CheatSchema;
  value: unknown;
  pending: boolean;
  disabled: boolean;
  pinned: boolean;
  onChange: (nextValue: unknown) => void;
  onTogglePin: () => void;
};

export function CheatTile({ cheat, value, pending, disabled, pinned, onChange, onTogglePin }: CheatTileProps) {
  return (
    <Card className="rounded-[8px] border-white/10 bg-white/4.5 shadow-xl shadow-black/20 transition-colors hover:border-emerald-300/25">
      <CardHeader className="gap-1.5 p-3 sm:gap-2 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-[0.95rem] font-bold text-white sm:text-base">{cheat.name}</CardTitle>
            {cheat.description ? <p className="mt-0.5 line-clamp-2 text-[0.78rem] text-muted-foreground sm:text-sm">{cheat.description}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {pending ? <Icon className="size-4 animate-spin text-emerald-200" name="loader" /> : null}
            <Badge className="hidden border-white/10 bg-black/20 text-white sm:inline-flex" variant="outline">{cheat.type}</Badge>
            <button
              type="button"
              onClick={onTogglePin}
              aria-label={pinned ? 'Unpin cheat' : 'Pin cheat'}
              title={pinned ? 'Unpin' : 'Pin to top'}
              className={cn(
                'flex size-7 items-center justify-center rounded-md border border-white/10 transition-colors',
                pinned
                  ? 'bg-amber-300/20 text-amber-200 hover:bg-amber-300/30'
                  : 'bg-white/5 text-muted-foreground hover:text-white',
              )}
            >
              <Icon className="size-4" name={pinned ? 'pin-off' : 'pin'} />
            </button>
          </div>
        </div>
        {cheat.instructions ? <p className="rounded-[8px] border border-amber-300/20 bg-amber-300/10 p-2 text-[0.72rem] text-amber-100 sm:text-xs">{cheat.instructions}</p> : null}
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
        <CheatControl cheat={cheat} value={value} pending={pending} disabled={disabled} onChange={onChange} />
      </CardContent>
    </Card>
  );
}
