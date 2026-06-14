import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from './contract';
import { isIncomingMessage, isOutgoingMessage } from './validation';

describe('web protocol validation', () => {
  it('rejects messages with another envelope version', () => {
    expect(isIncomingMessage({
      type: 'error',
      version: PROTOCOL_VERSION + 1,
      requestId: null,
      payload: { code: 'bad', message: 'bad' },
    })).toBe(false);
  });

  it('rejects incomplete required payloads', () => {
    expect(isIncomingMessage({
      type: 'hello_ack',
      version: PROTOCOL_VERSION,
      requestId: null,
      payload: { accepted: true },
    })).toBe(false);
    expect(isOutgoingMessage({
      type: 'set_value',
      version: PROTOCOL_VERSION,
      requestId: 'set',
      payload: { target: 'speed', value: 1 },
    })).toBe(false);
  });
});
