import { ECheatType, type CheatOption, type CheatOptionLike, type CheatSchema } from '../../../protocol/messages';

const NUMBER_GROUP_SEPARATOR_PATTERN = /[,\s]/g;

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

  return Number(value.trim().replace(NUMBER_GROUP_SEPARATOR_PATTERN, ''));
}
