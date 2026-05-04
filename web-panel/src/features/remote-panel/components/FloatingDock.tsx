import { Icon, type IconName } from '@/components/ui/icon';

import { cn } from '@/lib/utils';
import { EConnectionStatus } from '../state';

type FloatingDockProps = {
  status: EConnectionStatus;
  runningGameTitle: string | null;
  hidden: boolean;
  leftHasBadge: boolean;
  rightHasBadge: boolean;
  onOpenSettings: () => void;
  onOpenLibrary: () => void;
};

export const FloatingDock = ({
  status,
  runningGameTitle,
  hidden,
  leftHasBadge,
  rightHasBadge,
  onOpenSettings,
  onOpenLibrary,
}: FloatingDockProps) => {
  const live = status === EConnectionStatus.Connected;

  return (
    <div className={cn('absolute bottom-4.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-[#0e1016]/80 p-1.5 shadow-[0_12px_40px_-10px_rgba(0,0,0,.65),inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur-2xl transition duration-300', hidden ? 'translate-y-20 opacity-0' : 'translate-y-0 opacity-100')}>
      <DockButton badge={leftHasBadge} icon="settings" label="Settings" onClick={onOpenSettings} />
      <div className="flex h-9.5 items-center gap-2 border-x border-white/10 px-3">
        <span className={cn('size-1.5 rounded-full', live ? 'bg-(--deck-accent) shadow-[0_0_6px_var(--deck-accent)] motion-safe:animate-[breathe_2s_ease-in-out_infinite]' : 'bg-(--deck-fg-4)')} />
        <span className="max-w-30 truncate text-[11px] font-semibold text-(--deck-fg-2)">
          {runningGameTitle || 'No session'}
        </span>
      </div>
      <DockButton badge={rightHasBadge} icon="list" label="Library" onClick={onOpenLibrary} />
    </div>
  );
};

type DockButtonProps = {
  badge: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
};

const DockButton = ({ badge, icon, label, onClick }: DockButtonProps) => {
  return (
    <button type="button" aria-label={label} className="relative flex h-9.5 w-11 items-center justify-center rounded-full text-(--deck-fg) hover:bg-white/6" onClick={onClick}>
      <Icon className="size-4.5" name={icon} stroke={1.7} />
      {badge ? <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-(--deck-accent) shadow-[0_0_4px_var(--deck-accent)]" /> : null}
    </button>
  );
};
