import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';

export function EmptyDeck() {
  return (
    <Card className="rounded-[8px] border-dashed border-white/15 bg-white/[0.035]">
      <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 py-10 text-center">
        <div className="flex size-14 items-center justify-center rounded-[8px] border border-cyan-300/25 bg-cyan-500/10 text-cyan-200">
          <Icon className="size-8" name="radar" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">No trainer signal</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Connect the local bridge to stream trainer controls.</p>
        </div>
      </CardContent>
    </Card>
  );
}
