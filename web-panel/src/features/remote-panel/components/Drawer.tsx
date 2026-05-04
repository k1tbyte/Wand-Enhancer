import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const DRAWER_SIDE_CLASSES = {
  left: 'left-0 border-r',
  right: 'right-0 border-l',
} as const;

const DRAWER_CLOSED_CLASSES = {
  left: '-translate-x-full',
  right: 'translate-x-full',
} as const;

const DRAWER_OVERLAY_CLASS = 'remote-drawer-overlay absolute inset-0 z-30 transition-opacity duration-200 ease-out motion-reduce:transition-none';
const DRAWER_PANEL_CLASS = 'remote-drawer-panel absolute bottom-0 top-0 z-40 flex w-[88%] max-w-90 flex-col border-white/10 transition-transform duration-300 ease-out motion-reduce:transition-none';

type DrawerProps = {
  open: boolean;
  side: 'left' | 'right';
  children: ReactNode;
  onClose: () => void;
};

export const Drawer = ({ open, side, children, onClose }: DrawerProps) => {
  const sideClassName = DRAWER_SIDE_CLASSES[side];
  const closedClassName = DRAWER_CLOSED_CLASSES[side];

  return (
    <>
      <button
        type="button"
        aria-label="Close drawer"
        className={cn(DRAWER_OVERLAY_CLASS, open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
      />
      <aside aria-hidden={!open} className={cn(DRAWER_PANEL_CLASS, sideClassName, open ? 'translate-x-0' : closedClassName)} data-open={open ? 'true' : 'false'}>
        {children}
      </aside>
    </>
  );
};
