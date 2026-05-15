import { memo, useEffect, useMemo, useState } from 'react';

import { Icon } from '@/components/ui/icon';

import { cn } from '@/lib/utils';
import { CategoryIcon, type CategoryGroup } from '../category';
import type { CheatSchema } from '../protocol';
import { ECheatType } from '../protocol';
import { CheatTile } from './CheatTile';

type CategorySectionProps = {
  group: CategoryGroup;
  values: Record<string, unknown>;
  pendingTargets: Record<string, boolean>;
  pinnedTargets: Record<string, true>;
  disabled: boolean;
  openByDefault?: boolean;
  forceOpen?: boolean;
  onCheatChange: (cheat: CheatSchema, nextValue: unknown) => void;
  onTogglePin: (cheat: CheatSchema) => void;
};

const CategorySectionBase = ({
  group,
  values,
  pendingTargets,
  pinnedTargets,
  disabled,
  openByDefault = true,
  forceOpen = false,
  onCheatChange,
  onTogglePin,
}: CategorySectionProps) => {
  const [open, setOpen] = useState(openByDefault);
  const enabledCount = useMemo(() => getEnabledToggleCount(group.cheats, values), [group.cheats, values]);
  const toggleCount = useMemo(() => getToggleCount(group.cheats), [group.cheats]);
  const handleToggle = () => setOpen((current) => !current);

  const cheatHandlers = useMemo(
    () =>
      group.cheats.map((cheat) => ({
        onChange: (nextValue: unknown) => onCheatChange(cheat, nextValue),
        onTogglePin: () => onTogglePin(cheat),
      })),
    [group.cheats, onCheatChange, onTogglePin],
  );

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
    }
  }, [forceOpen]);

  return (
    <section className="mb-2.5 overflow-hidden rounded-[14px] border border-white/10 bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur-2xl">
      <button type="button" className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-(--deck-fg)" onClick={handleToggle}>
        <span className="flex size-7.5 shrink-0 items-center justify-center rounded-[8px] border border-[color-mix(in_oklab,var(--deck-accent)_22%,transparent)] bg-white/4 text-(--deck-accent)">
          <CategoryIcon category={group.id} className="size-3.75" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{group.label}</span>
          <span className="mt-0.5 block font-mono text-[10.5px] text-(--deck-fg-4)">{formatSummary(group.cheats.length, enabledCount, toggleCount)}</span>
        </span>
        {enabledCount > 0 ? <span className="inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-(--deck-accent) px-1.5 text-center font-mono text-[10px] font-bold leading-none tabular-nums text-black">{enabledCount}</span> : null}
        <Icon className={cn('size-4 text-(--deck-fg-3) transition-transform', open ? 'rotate-0' : '-rotate-90')} name="chevron-down" />
      </button>
      <div className={cn('overflow-hidden transition-[max-height] duration-300', open ? 'max-h-1000' : 'max-h-0')}>
        {group.cheats.map((cheat, index) => (
          <CheatTile
            key={cheat.uuid}
            cheat={cheat}
            value={values[cheat.target]}
            pending={Boolean(pendingTargets[cheat.target])}
            pinned={Boolean(pinnedTargets[cheat.target])}
            disabled={disabled}
            first={index === 0}
            onChange={cheatHandlers[index].onChange}
            onTogglePin={cheatHandlers[index].onTogglePin}
          />
        ))}
      </div>
    </section>
  );
};

export const CategorySection = memo(CategorySectionBase, (prev, next) => {
  if (prev.group !== next.group) return false;
  if (prev.disabled !== next.disabled) return false;
  if (prev.forceOpen !== next.forceOpen) return false;
  for (const cheat of next.group.cheats) {
    if (prev.values[cheat.target] !== next.values[cheat.target]) return false;
    if (prev.pendingTargets[cheat.target] !== next.pendingTargets[cheat.target]) return false;
    if (prev.pinnedTargets[cheat.target] !== next.pinnedTargets[cheat.target]) return false;
  }
  return true;
});

function getEnabledToggleCount(cheats: CheatSchema[], values: Record<string, unknown>): number {
  return cheats.filter((cheat) => cheat.type === ECheatType.Toggle && Boolean(values[cheat.target])).length;
}

function getToggleCount(cheats: CheatSchema[]): number {
  return cheats.filter((cheat) => cheat.type === ECheatType.Toggle).length;
}

function formatSummary(cheatCount: number, enabledCount: number, toggleCount: number): string {
  if (toggleCount <= 0) {
    return `${cheatCount} mods`;
  }

  return `${cheatCount} mods · ${enabledCount}/${toggleCount} on`;
}
