import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { type ReactNode, useEffect, useRef } from 'react';

import { cn } from '@/shared/lib/ui';

const DRAWER_SIDE_CLASSES = {
    left: 'left-0 border-r',
    right: 'right-0 border-l',
} as const;

const DRAWER_CLOSED_CLASSES = {
    left: '-translate-x-full',
    right: 'translate-x-full',
} as const;

const DRAWER_OVERLAY_CLASS =
    'remote-drawer-overlay absolute inset-0 z-30 transition-opacity duration-200 ease-out motion-reduce:transition-none';
const DRAWER_PANEL_CLASS =
    'remote-drawer-panel absolute bottom-0 top-0 z-40 flex w-[88%] max-w-90 flex-col border-white/10 transition-transform duration-300 ease-out motion-reduce:transition-none';

const FOCUSABLE_SELECTOR =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type DrawerProps = {
    open: boolean;
    side: 'left' | 'right';
    /** Accessible name for the dialog; an icon-only drawer has no other one. */
    label: string;
    children: ReactNode;
    onClose: () => void;
};

export const Drawer = ({ open, side, label, children, onClose }: DrawerProps) => {
    const { _ } = useLingui();
    const panelRef = useRef<HTMLElement | null>(null);
    const restoreFocusRef = useRef<HTMLElement | null>(null);
    const sideClassName = DRAWER_SIDE_CLASSES[side];
    const closedClassName = DRAWER_CLOSED_CLASSES[side];

    useEffect(() => {
        if (!open) {
            return;
        }

        restoreFocusRef.current = document.activeElement as HTMLElement | null;
        focusFirst(panelRef.current);

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }
            if (event.key === 'Tab') {
                trapTab(event, panelRef.current);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            restoreFocusRef.current?.focus?.();
        };
    }, [open, onClose]);

    return (
        <>
            <button
                type="button"
                aria-label={_(msg`Close drawer`)}
                tabIndex={open ? 0 : -1}
                className={cn(
                    DRAWER_OVERLAY_CLASS,
                    open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
                )}
                onClick={onClose}
            />
            <aside
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                aria-hidden={!open}
                // Nothing inside a closed drawer should be reachable by keyboard.
                inert={!open ? true : undefined}
                className={cn(
                    DRAWER_PANEL_CLASS,
                    sideClassName,
                    open ? 'translate-x-0' : closedClassName,
                )}
                data-open={open ? 'true' : 'false'}
            >
                {children}
            </aside>
        </>
    );
};

function focusFirst(panel: HTMLElement | null): void {
    panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
}

function trapTab(event: KeyboardEvent, panel: HTMLElement | null): void {
    const focusable = panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        : [];
    if (focusable.length === 0) {
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
        return;
    }

    if (event.shiftKey && (active === first || !panel?.contains(active))) {
        event.preventDefault();
        last.focus();
    }
}
