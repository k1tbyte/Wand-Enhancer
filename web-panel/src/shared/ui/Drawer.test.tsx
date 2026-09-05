import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Drawer } from './Drawer';

i18n.load('en', {});
i18n.activate('en');

const renderWithI18n = (ui: React.ReactNode) =>
    render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);

afterEach(() => {
    cleanup();
});

describe('Drawer', () => {
    it('restores opener focus on close', () => {
        const TestComponent = () => {
            const [open, setOpen] = useState(false);
            return (
                <div>
                    <button type="button" onClick={() => setOpen(true)}>
                        Open Drawer
                    </button>
                    <Drawer
                        open={open}
                        side="left"
                        label="Test Drawer"
                        onClose={() => setOpen(false)}
                    >
                        <button type="button">Inside</button>
                    </Drawer>
                </div>
            );
        };
        renderWithI18n(<TestComponent />);

        const openBtn = screen.getByText('Open Drawer');
        openBtn.focus();
        expect(document.activeElement).toBe(openBtn);

        fireEvent.click(openBtn);
        expect(document.activeElement).toBe(screen.getByText('Inside'));

        fireEvent.click(screen.getByLabelText('Close drawer'));
        expect(document.activeElement).toBe(openBtn);
    });

    it('preserves input focus across rerender with new callback and Escape invokes latest callback', () => {
        const spy1 = vi.fn();
        const spy2 = vi.fn();

        const TestComponent = () => {
            const [step, setStep] = useState(0);
            return (
                <div>
                    <button type="button" onClick={() => setStep(1)}>
                        Update
                    </button>
                    <Drawer
                        open={true}
                        side="left"
                        label="Test Drawer"
                        onClose={step === 0 ? spy1 : spy2}
                    >
                        <input type="text" placeholder="Search" />
                    </Drawer>
                </div>
            );
        };
        renderWithI18n(<TestComponent />);

        const input = screen.getByPlaceholderText('Search');
        expect(document.activeElement).toBe(input);

        // Update the callback
        fireEvent.click(screen.getByText('Update'));

        // Focus should remain on the input
        expect(document.activeElement).toBe(input);

        // Escape should call the latest callback
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(spy1).not.toHaveBeenCalled();
        expect(spy2).toHaveBeenCalledOnce();
    });

    it('wraps Tab focus', () => {
        renderWithI18n(
            <Drawer open={true} side="left" label="Test Drawer" onClose={() => {}}>
                <button type="button">First</button>
                <button type="button">Second</button>
                <button type="button">Third</button>
            </Drawer>,
        );

        const first = screen.getByText('First');
        const third = screen.getByText('Third');

        expect(document.activeElement).toBe(first);

        // Third element is active, Tab wraps to First
        third.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement).toBe(first);

        // First element is active, Shift+Tab wraps to Third
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(third);
    });
});
