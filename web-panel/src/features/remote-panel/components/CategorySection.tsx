import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CategoryIcon, type CategoryGroup, getCategoryAccent } from '../category';
import type { CheatSchema } from '../protocol';
import { CheatTile } from './CheatTile';

type CategorySectionProps = {
  group: CategoryGroup;
  values: Record<string, unknown>;
  pendingTargets: Record<string, boolean>;
  pinnedTargets: Record<string, true>;
  disabled: boolean;
  onCheatChange: (cheat: CheatSchema, nextValue: unknown) => void;
  onTogglePin: (cheat: CheatSchema) => void;
};

export function CategorySection({
  group,
  values,
  pendingTargets,
  pinnedTargets,
  disabled,
  onCheatChange,
  onTogglePin,
}: CategorySectionProps) {
  return (
    <section className="space-y-2 sm:space-y-3">
      <header className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={cn('flex size-8 items-center justify-center rounded-[8px] ring-1 sm:size-10', getCategoryAccent(group.id))}>
            <CategoryIcon category={group.id} className="size-4 sm:size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white sm:text-xl">{group.label}</h3>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-xs">{group.id}</p>
          </div>
        </div>
        <Badge className="border-white/10 bg-white/5 text-white" variant="outline">
          {group.cheats.length} nodes
        </Badge>
      </header>

      <div className="grid gap-2 sm:gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {group.cheats.map((cheat) => (
          <CheatTile
            key={cheat.uuid}
            cheat={cheat}
            value={values[cheat.target]}
            pending={Boolean(pendingTargets[cheat.target])}
            pinned={Boolean(pinnedTargets[cheat.target])}
            disabled={disabled}
            onChange={(nextValue) => onCheatChange(cheat, nextValue)}
            onTogglePin={() => onTogglePin(cheat)}
          />
        ))}
      </div>
    </section>
  );
}
