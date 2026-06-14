import { formatHumanLabel } from '@/shared/lib/ui';
import type { CheatSchema, TrainerMetaPayload, TrainerSummary } from '../../../protocol/messages';

export type CategoryGroup = {
  id: string;
  label: string;
  cheats: CheatSchema[];
};

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
    .map(([id, cheats]) => ({ id, label: formatHumanLabel(id), cheats }))
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
    label: formatHumanLabel(PINNED_CATEGORY_ID),
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

