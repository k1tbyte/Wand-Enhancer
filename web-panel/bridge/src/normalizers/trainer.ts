import { cloneValue } from '../utils';

type SnapshotShape = {
    trainerMeta?: {
        schema?: {
            cheats?: Array<{ target: string; type?: string }>;
        };
    };
};

export function normalizeTrainerValue(
    snapshot: SnapshotShape | null | undefined,
    target: string,
    value: unknown,
): unknown {
    const cheat = snapshot?.trainerMeta?.schema?.cheats?.find((entry) => entry.target === target);
    return cheat?.type === 'toggle' ? Boolean(value) : cloneValue(value);
}
