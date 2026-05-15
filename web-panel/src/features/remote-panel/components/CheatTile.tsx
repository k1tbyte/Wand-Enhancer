import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import type { CheatSchema } from '../protocol';
import { ECheatType } from '../protocol';
import { CheatControl } from '../controls/CheatControl';

type CheatTileProps = {
  cheat: CheatSchema;
  value: unknown;
  pending: boolean;
  disabled: boolean;
  pinned: boolean;
  first: boolean;
  onChange: (nextValue: unknown) => void;
  onTogglePin: () => void;
};

const SWIPE_REVEAL = 80;
const SWIPE_TRIGGER = 56;
const SWIPE_DEAD_ZONE = 8;
const SWIPE_ANIMATION_MS = 220;

const CheatTileBase = ({ cheat, value, pending, disabled, pinned, first, onChange, onTogglePin }: CheatTileProps) => {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [armed, setArmed] = useState(false);
  const dragRef = useRef<{ id: number; startX: number; startY: number; locked: boolean | null } | null>(null);

  useEffect(() => {
    setOffset(0);
    setArmed(false);
  }, [pinned]);

  const settle = (target: number) => {
    setAnimating(true);
    setOffset(target);
    window.setTimeout(() => setAnimating(false), SWIPE_ANIMATION_MS);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (isInteractiveTarget(event.target)) return;
    dragRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, locked: null };
    setAnimating(false);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (drag.locked === null) {
      if (Math.abs(dx) < SWIPE_DEAD_ZONE && Math.abs(dy) < SWIPE_DEAD_ZONE) return;
      drag.locked = Math.abs(dx) > Math.abs(dy) && dx < 0;
      if (!drag.locked) {
        dragRef.current = null;
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const next = clamp(dx, -SWIPE_REVEAL * 1.2, 0);
    setOffset(next);
    setArmed(-next >= SWIPE_TRIGGER);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;

    if (drag.locked !== true) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const triggered = -offset >= SWIPE_TRIGGER;
    settle(0);
    setArmed(false);
    if (triggered) {
      onTogglePin();
    }
  };

  const stacked = isStackedControl(cheat);
  const showReveal = offset < 0;

  return (
    <div className={cn('relative overflow-hidden', first ? '' : 'border-t border-white/[0.06]')}>
      {showReveal ? <PinReveal pinned={pinned} armed={armed} /> : null}
      <div
        className={cn('relative', animating ? 'transition-transform duration-200 ease-out' : '')}
        style={{ transform: `translate3d(${offset}px, 0, 0)`, touchAction: 'pan-y' }}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
      >
        <div className="flex flex-col gap-2 px-3.5 py-3">
          <div className={cn('flex gap-3', stacked ? 'flex-col items-stretch' : 'items-start justify-between')}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="truncate text-[13.5px] font-medium leading-tight text-(--deck-fg)">{cheat.name}</h4>
                {pending ? <Icon className="size-3.5 shrink-0 animate-spin text-(--deck-accent)" name="loader" /> : null}
              </div>
              {cheat.description ? <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-(--deck-fg-3)">{cheat.description}</p> : null}
            </div>
            <CheatControl cheat={cheat} disabled={disabled} pending={pending} value={value} onChange={onChange} />
          </div>
          {cheat.instructions ? (
            <div className="flex gap-2 rounded-[8px] border border-amber-300/25 bg-amber-400/10 px-2.5 py-2 text-[11.5px] leading-5 text-amber-200">
              <Icon className="mt-0.5 size-3.5 shrink-0" name="alert" />
              <span>{cheat.instructions}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const CheatTile = memo(CheatTileBase);

const PinReveal = ({ pinned, armed }: { pinned: boolean; armed: boolean }) => {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-center px-4">
      <span className={cn('flex size-9 items-center justify-center rounded-full border transition-all duration-150', armed ? 'scale-110 border-(--deck-accent) bg-[color-mix(in_oklab,var(--deck-accent)_28%,transparent)] text-(--deck-accent) shadow-[0_0_0_4px_color-mix(in_oklab,var(--deck-accent)_18%,transparent)]' : 'border-white/10 bg-white/[0.06] text-(--deck-fg-3)')}>
        <Icon className="size-4" name={pinned ? 'pin-off' : 'pin'} />
      </span>
    </div>
  );
};

function isStackedControl(cheat: CheatSchema): boolean {
  if (
    cheat.type === ECheatType.Slider ||
    cheat.type === ECheatType.Scalar ||
    cheat.type === ECheatType.Number ||
    cheat.type === ECheatType.Incremental ||
    cheat.type === ECheatType.Button
  ) {
    return true;
  }

  if (cheat.type === ECheatType.Selection) {
    const optionCount = cheat.args.options?.length ?? 0;
    return optionCount > 0;
  }

  return false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, button, select, textarea, a, [role="slider"], [role="button"]'));
}
