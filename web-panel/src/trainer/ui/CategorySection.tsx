import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { memo, useEffect, useMemo, useState } from 'react';
import { cn, formatHumanLabel } from '@/shared/lib/ui';
import { Icon } from '@/shared/ui/Icon';
import type { CheatSchema } from '../../../protocol/messages';
import { ECheatType } from '../../../protocol/messages';
import type { CategoryGroup } from '../model/categories';
import { CategoryIcon } from './CategoryIcon';
import { CheatTile } from './CheatTile';
import { CATEGORY_LABELS } from './category-labels';

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
    const { _ } = useLingui();
    const [open, setOpen] = useState(openByDefault);
    const panelId = `category-panel-${group.id}`;
    const { toggleCount, enabledCount } = useMemo(
        () => countToggles(group.cheats, values),
        [group.cheats, values],
    );
    const handleToggle = () => setOpen((current) => !current);

    const cheatCount = group.cheats.length;
    const descriptor = CATEGORY_LABELS[group.id.toLowerCase()];
    const label = descriptor ? _(descriptor) : formatHumanLabel(group.id);
    const summary =
        toggleCount > 0
            ? _(msg`${cheatCount} mods · ${enabledCount}/${toggleCount} on`)
            : _(msg`${cheatCount} mods`);

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
        <section className="mb-2.5 overflow-hidden rounded-[14px] border border-white/10 bg-white/3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur-2xl">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-(--deck-fg)"
                onClick={handleToggle}
            >
                <span className="flex size-7.5 shrink-0 items-center justify-center rounded-[8px] border border-[color-mix(in_oklab,var(--deck-accent)_22%,transparent)] bg-white/4 text-(--deck-accent)">
                    <CategoryIcon category={group.id} className="size-3.75" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{label}</span>
                    <span className="mt-0.5 block font-mono text-[10.5px] text-(--deck-fg-4)">
                        {summary}
                    </span>
                </span>
                {enabledCount > 0 ? (
                    <span className="inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-(--deck-accent) px-1.5 text-center font-mono text-[10px] font-bold leading-none tabular-nums text-black">
                        {enabledCount}
                    </span>
                ) : null}
                <Icon
                    className={cn(
                        'size-4 text-(--deck-fg-3) transition-transform',
                        open ? 'rotate-0' : '-rotate-90',
                    )}
                    name="chevron-down"
                />
            </button>
            <div
                id={panelId}
                className={cn(
                    'grid transition-[grid-template-rows] duration-300',
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
            >
                <div className="overflow-hidden">
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
            </div>
        </section>
    );
};

export const CategorySection = memo(CategorySectionBase, (prev, next) => {
    if (prev.group !== next.group) return false;
    if (prev.disabled !== next.disabled) return false;
    if (prev.forceOpen !== next.forceOpen) return false;
    // Skipping these would keep stale handlers alive whenever the parent stops
    // memoising them - a correctness guarantee should not rest on that assumption.
    if (prev.onCheatChange !== next.onCheatChange) return false;
    if (prev.onTogglePin !== next.onTogglePin) return false;
    for (const cheat of next.group.cheats) {
        if (prev.values[cheat.target] !== next.values[cheat.target]) return false;
        if (prev.pendingTargets[cheat.target] !== next.pendingTargets[cheat.target]) return false;
        if (prev.pinnedTargets[cheat.target] !== next.pinnedTargets[cheat.target]) return false;
    }
    return true;
});

function countToggles(
    cheats: CheatSchema[],
    values: Record<string, unknown>,
): { toggleCount: number; enabledCount: number } {
    let toggleCount = 0;
    let enabledCount = 0;
    for (const cheat of cheats) {
        if (cheat.type !== ECheatType.Toggle) continue;
        toggleCount += 1;
        if (values[cheat.target]) enabledCount += 1;
    }
    return { toggleCount, enabledCount };
}
