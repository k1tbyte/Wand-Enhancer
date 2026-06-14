import { describe, expect, it } from 'vitest';

import { validateClientMessage, validateSetValueTarget } from './protocol-router';

const snapshot = {
  trainerMeta: {
    trainer: { trainerId: 'active' },
    schema: { cheats: [{ target: 'god', type: 'toggle' }] },
  },
  trainerValues: { values: { god: false } },
};

describe('bridge protocol router', () => {
  it('requires a compatible hello before commands', () => {
    const command = {
      type: 'set_value',
      version: 1,
      requestId: 'set',
      payload: { trainerId: 'active', target: 'god', value: true },
    };
    expect(validateClientMessage(command, false)).toMatchObject({
      ok: false,
      error: { code: 'handshake_required' },
    });
    expect(validateClientMessage({ ...command, version: 2 }, true)).toMatchObject({
      ok: false,
      error: { code: 'protocol_mismatch' },
    });
  });

  it('validates trainer and target while normalizing toggle values', () => {
    expect(validateSetValueTarget({
      payload: { trainerId: 'other', target: 'god', value: 1 },
    }, snapshot)).toMatchObject({ ok: false, error: { code: 'trainer_mismatch' } });

    expect(validateSetValueTarget({
      payload: { trainerId: 'active', target: 'god', value: 1 },
    }, snapshot)).toMatchObject({ ok: true, value: true });
  });
});
