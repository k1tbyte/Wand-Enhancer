import { Icon, type IconName } from '@/components/ui/icon';
import type { CheatSchema, TrainerMetaPayload, TrainerSummary } from './protocol';

const CATEGORY_LABELS: Record<string, string> = {
  challenge: 'Challenge',
  character: 'Character',
  cheats: 'Cheats',
  crafting: 'Crafting',
  enemies: 'Enemies',
  game: 'Game',
  inventory: 'Inventory',
  items: 'Items',
  physics: 'Physics',
  pinned: 'Pinned',
  player: 'Player',
  resources: 'Resources',
  stats: 'Stats',
  teleport: 'Teleport',
  vehicles: 'Vehicles',
  weapons: 'Weapons',
  world: 'World',
};

const CATEGORY_ICONS: Record<string, IconName> = {
  challenge: 'flame',
  character: 'user',
  cheats: 'sparkles',
  crafting: 'hammer',
  enemies: 'heart-broken',
  game: 'gamepad',
  inventory: 'backpack',
  items: 'package',
  physics: 'atom',
  pinned: 'bolt',
  player: 'user',
  resources: 'box',
  stats: 'chart',
  teleport: 'map-pin',
  vehicles: 'car',
  weapons: 'swords',
  world: 'world',
};

const CATEGORY_ACCENTS: Record<string, string> = {
  challenge: 'text-orange-300 bg-orange-500/12 ring-orange-300/30',
  enemies: 'text-red-300 bg-red-500/12 ring-red-300/30',
  inventory: 'text-amber-200 bg-amber-500/12 ring-amber-200/30',
  physics: 'text-cyan-200 bg-cyan-500/12 ring-cyan-200/30',
  player: 'text-emerald-200 bg-emerald-500/12 ring-emerald-200/30',
  stats: 'text-fuchsia-200 bg-fuchsia-500/12 ring-fuchsia-200/30',
  teleport: 'text-sky-200 bg-sky-500/12 ring-sky-200/30',
  vehicles: 'text-lime-200 bg-lime-500/12 ring-lime-200/30',
  weapons: 'text-rose-200 bg-rose-500/12 ring-rose-200/30',
  world: 'text-teal-200 bg-teal-500/12 ring-teal-200/30',
};

export type CategoryGroup = {
  id: string;
  label: string;
  cheats: CheatSchema[];
};

export function formatCategoryName(category: string): string {
  const key = category.toLowerCase();
  if (CATEGORY_LABELS[key]) {
    return CATEGORY_LABELS[key];
  }

  return category
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function groupCheatsByCategory(trainerMeta: TrainerMetaPayload | null): CategoryGroup[] {
  if (!trainerMeta) {
    return [];
  }

  const grouped = new Map<string, CheatSchema[]>();
  for (const cheat of trainerMeta.schema.cheats) {
    const bucket = grouped.get(cheat.category) ?? [];
    bucket.push(cheat);
    grouped.set(cheat.category, bucket);
  }

  return Array.from(grouped.entries())
    .map(([id, cheats]) => ({ id, label: formatCategoryName(id), cheats }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export const PINNED_CATEGORY_ID = 'pinned';

export function buildPinnedGroup(
  trainerMeta: TrainerMetaPayload | null,
  pinnedTargets: Record<string, true>,
): CategoryGroup | null {
  if (!trainerMeta) {
    return null;
  }

  const pinnedCheats = trainerMeta.schema.cheats.filter((cheat) => pinnedTargets[cheat.target]);
  if (pinnedCheats.length === 0) {
    return null;
  }

  return {
    id: PINNED_CATEGORY_ID,
    label: formatCategoryName(PINNED_CATEGORY_ID),
    cheats: pinnedCheats,
  };
}

export function filterGroups(groups: CategoryGroup[], query: string): CategoryGroup[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return groups;
  }

  const result: CategoryGroup[] = [];
  for (const group of groups) {
    const matchesGroup = group.label.toLowerCase().includes(normalized) || group.id.toLowerCase().includes(normalized);
    const cheats = matchesGroup
      ? group.cheats
      : group.cheats.filter((cheat) => cheatMatchesQuery(cheat, normalized));

    if (cheats.length > 0) {
      result.push({ ...group, cheats });
    }
  }

  return result;
}

function cheatMatchesQuery(cheat: CheatSchema, query: string): boolean {
  if (cheat.name?.toLowerCase().includes(query)) return true;
  if (cheat.target?.toLowerCase().includes(query)) return true;
  if (cheat.category?.toLowerCase().includes(query)) return true;
  if (cheat.description?.toLowerCase().includes(query)) return true;
  if (cheat.type?.toLowerCase().includes(query)) return true;
  return false;
}

export function getTrainerDisplayName(trainer: TrainerSummary): string {
  return trainer.displayName?.trim() || trainer.gameId || trainer.titleId || trainer.trainerId;
}

export function getCategoryAccent(category: string): string {
  return CATEGORY_ACCENTS[category.toLowerCase()] ?? 'text-emerald-200 bg-emerald-500/12 ring-emerald-200/30';
}

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  return <Icon className={className} name={CATEGORY_ICONS[category.toLowerCase()] ?? 'gamepad'} stroke={1.8} />;
}
