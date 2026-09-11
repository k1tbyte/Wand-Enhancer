import {
    type CheatOption,
    type CheatOptionLike,
    type CheatSchema,
    ECheatType,
} from '../../../protocol/messages';
import { stripNumberGrouping } from '../controls/format-number';

// Wand sends option values as either strings or numbers for the same cheat, so identity
// is compared by string form.
export function isSameOption(left: unknown, right: unknown): boolean {
    return String(left) === String(right);
}

export function resolveOption(option: CheatOptionLike): CheatOption {
    if (typeof option === 'string' || typeof option === 'number') {
        return { label: String(option), value: option };
    }

    return {
        label: option.label ?? String(option.value),
        value: option.value,
    };
}

export function normalizeCheatValue(cheat: CheatSchema, value: unknown): unknown {
    if (cheat.type === ECheatType.Toggle) {
        return Boolean(value);
    }

    if (cheat.type !== ECheatType.Slider && cheat.type !== ECheatType.Number) {
        return value;
    }

    if (typeof value !== 'string' || !value.trim()) {
        return value;
    }

    return Number(stripNumberGrouping(value.trim()));
}
