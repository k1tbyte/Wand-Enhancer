import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';

import type { TrainerSummary } from '../../../protocol/messages';
import { PlaceholderState } from './PlaceholderState';

type SessionPlaceholderProps = {
  connected: boolean;
  activeTrainer: TrainerSummary | null;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
};

export const SessionPlaceholder = ({
  connected,
  activeTrainer,
  onOpenLibrary,
  onOpenSettings,
}: SessionPlaceholderProps) => {
  const { _ } = useLingui();

  if (!connected) {
    return (
      <PlaceholderState
        icon="plug"
        title={_(msg`Bridge offline`)}
        sub={_(msg`Open Settings to point Wand at your trainer bridge over WebSocket.`)}
        action={_(msg`Open Settings`)}
        onAction={onOpenSettings}
      />
    );
  }

  if (!activeTrainer) {
    return (
      <PlaceholderState
        icon="gamepad-variant-outline"
        title={_(msg`Select a game`)}
        sub={_(msg`No game is running yet. Open the library and launch one to start tweaking.`)}
        action={_(msg`Browse library`)}
        onAction={onOpenLibrary}
      />
    );
  }

  return null;
};
