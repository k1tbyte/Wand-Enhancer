import { numericValue } from './format-number';
import { type ControlInternalProps, SliderReadout } from './shared';

export const SliderControl = ({ cheat, value, disabled, onChange }: ControlInternalProps) => {
    const min = cheat.args.min ?? 0;
    const max = cheat.args.max ?? 100;
    const step = cheat.args.step ?? 1;
    const currentValue = numericValue(value, min);

    return (
        <div className="w-full">
            <SliderReadout
                disabled={disabled}
                label={cheat.name}
                max={max}
                min={min}
                postfix={cheat.args.postfix ?? ''}
                step={step}
                value={currentValue}
                onChange={onChange}
            />
        </div>
    );
};
