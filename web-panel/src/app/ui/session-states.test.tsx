import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';

import type { TrainerSummary } from '../../../protocol/messages';
import { TrainerHeader } from '../../trainer/ui/TrainerHeader';
import { SessionPlaceholder } from './SessionPlaceholder';

i18n.load('en', {});
i18n.activate('en');

const renderWithI18n = (ui: ReactNode) => render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);

const trainer: TrainerSummary = {
  trainerId: 'trainer',
  gameId: 'game',
  displayName: 'Test Trainer',
  trainerLoading: false,
  gameInstalled: true,
  needsCompatibilityWarning: false,
  isTimeLimitExpired: false,
};

describe('session state components', () => {
  it('renders the offline intent', () => {
    const openSettings = vi.fn();
    renderWithI18n(<SessionPlaceholder connected={false} activeTrainer={null} onOpenLibrary={() => undefined} onOpenSettings={openSettings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(screen.getByText('Bridge offline')).toBeTruthy();
    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('renders the no-trainer intent', () => {
    renderWithI18n(<SessionPlaceholder connected activeTrainer={null} onOpenLibrary={() => undefined} onOpenSettings={() => undefined} />);
    expect(screen.getByText('Select a game')).toBeTruthy();
  });

  it('renders an active trainer header', () => {
    renderWithI18n(<TrainerHeader trainer={trainer} game={null} isPinned={false} onPin={() => undefined} />);
    expect(screen.getByText('Test Trainer')).toBeTruthy();
    expect(screen.getByText('Trainer Active')).toBeTruthy();
  });
});
