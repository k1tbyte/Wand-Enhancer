import { useCallback, useEffect, useState } from 'react';

import type { TrainerMetaPayload } from '../../../protocol/messages';
import { capturePresetValues, createPreset, loadPresets, savePresets, type RemotePreset } from './preset-storage';

type PresetsParams = {
  presetStorageKey: string;
  trainerMeta: TrainerMetaPayload | null;
  values: Record<string, unknown>;
  onError: (message: string) => void;
};

export function usePresets({ presetStorageKey, trainerMeta, values, onError }: PresetsParams) {
  const [presets, setPresets] = useState<RemotePreset[]>([]);

  useEffect(() => {
    setPresets(loadPresets(presetStorageKey));
  }, [presetStorageKey]);

  const addPreset = useCallback(
    (name: string): boolean => {
      if (!trainerMeta) {
        onError('No active trainer to save as a preset.');
        return false;
      }

      const captured = capturePresetValues(trainerMeta.schema.cheats, values);
      if (Object.keys(captured).length === 0) {
        onError('There are no mod values to save yet.');
        return false;
      }

      const next = [...presets, createPreset(name, captured)];
      if (!savePresets(presetStorageKey, next)) {
        onError('Could not save the preset in this browser. Check site storage permissions and available space.');
        return false;
      }
      setPresets(next);
      return true;
    },
    [onError, presets, presetStorageKey, trainerMeta, values],
  );

  const deletePreset = useCallback(
    (presetId: string) => {
      const next = presets.filter((preset) => preset.id !== presetId);
      if (!savePresets(presetStorageKey, next)) {
        onError('Could not update presets in this browser. Check site storage permissions and available space.');
        return;
      }
      setPresets(next);
    },
    [onError, presets, presetStorageKey],
  );

  return { presets, addPreset, deletePreset };
}
