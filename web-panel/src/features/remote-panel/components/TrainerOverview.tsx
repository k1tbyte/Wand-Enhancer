import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { getTrainerDisplayName } from '../category';
import type { TrainerSummary } from '../protocol';

type TrainerOverviewProps = {
  trainer: TrainerSummary;
  cheatCount: number;
  categoryCount: number;
};

export function TrainerOverview({ trainer, cheatCount, categoryCount }: TrainerOverviewProps) {
  return (
    <section className="grid gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(160px,0.7fr))]">
      <Card className="rounded-[8px] border-emerald-300/20 bg-emerald-300/8 shadow-xl shadow-emerald-950/20">
        <CardContent className="flex items-center gap-2.5 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4">
          <div className="flex size-10 items-center justify-center rounded-[8px] border border-emerald-300/25 bg-black/25 text-emerald-200 sm:size-12">
            <Icon className="size-5 sm:size-7" name="gamepad" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-100/70 sm:text-[0.68rem]">Active trainer</p>
            <h2 className="truncate text-lg font-bold text-white sm:text-2xl">{getTrainerDisplayName(trainer)}</h2>
            <div className="mt-1 flex flex-wrap gap-1 sm:gap-1.5">
              <Badge className="border-white/10 bg-white/5 text-white" variant="outline">{trainer.gameVersion ?? 'unknown build'}</Badge>
              <Badge className="border-white/10 bg-white/5 text-white" variant="outline">{trainer.language ?? 'n/a'}</Badge>
              <Badge className="border-white/10 bg-white/5 text-white" variant="outline">#{trainer.trainerId}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:contents">
        <StatCard icon={<Icon className="size-5" name="boxes" />} label="Cheats" value={cheatCount} />
        <StatCard icon={<Icon className="size-5" name="category" />} label="Loadouts" value={categoryCount} />
      </div>

      {trainer.needsCompatibilityWarning ? (
        <Card className="rounded-[8px] border-orange-300/25 bg-orange-500/10 lg:col-span-3">
          <CardContent className="flex items-center gap-2 px-3 py-2.5 text-orange-100 sm:px-4 sm:py-3">
            <Icon className="size-4" name="trophy" />
            Compatibility warning active
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <Card className="rounded-[8px] border-white/10 bg-white/4.5">
      <CardContent className="flex items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4">
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-[0.68rem]">{label}</p>
          <p className="text-2xl font-bold text-white sm:text-3xl">{value}</p>
        </div>
        <div className="flex size-9 items-center justify-center rounded-[8px] border border-amber-300/20 bg-amber-300/10 text-amber-200 sm:size-10">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
