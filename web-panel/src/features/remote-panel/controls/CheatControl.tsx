import { type ReactElement } from 'react';

import type { CheatSchema } from '../protocol';
import { ECheatType } from '../protocol';
import { ActionButton } from './ActionButton';
import { IncrementalControl } from './IncrementalControl';
import { NumberControl } from './NumberControl';
import { ScalarControl } from './ScalarControl';
import { SelectionControl } from './SelectionControl';
import { SliderControl } from './SliderControl';
import { ToggleControl } from './ToggleControl';
import type { ControlInternalProps } from './shared';

type CheatControlProps = {
  cheat: CheatSchema;
  value: unknown;
  pending: boolean;
  disabled: boolean;
  onChange: (nextValue: unknown) => void;
};

const CONTROL_BY_TYPE: Record<ECheatType, (props: ControlInternalProps) => ReactElement> = {
  [ECheatType.Toggle]: (props) => <ToggleControl {...props} />,
  [ECheatType.Slider]: (props) => <SliderControl {...props} />,
  [ECheatType.Number]: (props) => <NumberControl {...props} />,
  [ECheatType.Button]: (props) => <ActionButton {...props} />,
  [ECheatType.Selection]: (props) => <SelectionControl {...props} />,
  [ECheatType.Scalar]: (props) => <ScalarControl {...props} />,
  [ECheatType.Incremental]: (props) => <IncrementalControl {...props} />,
};

export const CheatControl = ({ cheat, value, pending, disabled, onChange }: CheatControlProps) => {
  const Renderer = CONTROL_BY_TYPE[cheat.type];
  if (!Renderer) {
    return <span className="text-[12px] text-red-200">Unsupported: {cheat.type}</span>;
  }

  return <Renderer cheat={cheat} disabled={disabled || pending} value={value} onChange={onChange} />;
};
