import { WEB_CONTRACT } from '../../protocol/contract';
import {
  type HelloMessage,
  type IncomingMessage,
  type OutgoingMessage,
  PROTOCOL_VERSION,
  type RemoteCommandMessage,
  type SetValueMessage,
} from '../../protocol/messages';
import { isIncomingMessage } from '../../protocol/validation';

type SocketHandlers = {
  onConnecting: () => void;
  onTransportOpen: () => void;
  onMessage: (message: IncomingMessage) => void;
  onClose: () => void;
  onError: (message: string) => void;
};

let requestSequence = 0;

export class RemoteSessionClient {
  private socket: WebSocket | null = null;
  private intentionalDisconnect = false;

  constructor(
    private readonly url: string,
    private readonly handlers: SocketHandlers,
  ) {}

  connect(): void {
    this.disconnect();
    this.intentionalDisconnect = false;
    this.handlers.onConnecting();

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.handlers.onTransportOpen();
      this.send(this.createHelloMessage());
    });
    socket.addEventListener('message', (event) => this.handleMessage(event));
    socket.addEventListener('close', () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      if (!this.intentionalDisconnect) {
        this.handlers.onClose();
      }
    });
    socket.addEventListener('error', () => this.handlers.onError('WebSocket connection failed.'));
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.socket?.close();
    this.socket = null;
  }

  isOpen(): boolean {
    return Boolean(this.socket && this.socket.readyState === WebSocket.OPEN);
  }

  setValue(trainerId: string, target: string, value: unknown, cheatId?: string): string | null {
    const requestId = createRequestId(`set_${target}`);
    const message: SetValueMessage = {
      type: 'set_value',
      version: PROTOCOL_VERSION,
      requestId,
      payload: { trainerId, target, value, cheatId },
    };
    return this.send(message) ? requestId : null;
  }

  launchGame(gameId: string, titleId?: string): boolean {
    return this.sendCommand('launch', gameId, titleId);
  }

  stopPlaying(gameId?: string, titleId?: string): boolean {
    return this.sendCommand('stop', gameId, titleId);
  }

  private send(message: OutgoingMessage): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  private sendCommand(action: 'launch' | 'stop', gameId?: string, titleId?: string): boolean {
    const message: RemoteCommandMessage = {
      type: 'remote_command',
      version: PROTOCOL_VERSION,
      requestId: createRequestId(`command_${action}`),
      payload: { action, gameId, titleId },
    };
    return this.send(message);
  }

  private createHelloMessage(): HelloMessage {
    return {
      type: 'hello',
      version: PROTOCOL_VERSION,
      requestId: createRequestId('hello'),
      payload: {
        client: 'mobile-web',
        clientVersion: WEB_CONTRACT.clientVersion,
        capabilities: { supportsDeltaValues: true, supportsTrainerSwitch: true },
      },
    };
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const parsed = JSON.parse(String(event.data)) as unknown;
      if (!isIncomingMessage(parsed)) {
        this.handlers.onError('Received an invalid protocol message.');
        return;
      }
      this.handlers.onMessage(parsed);
    } catch (error) {
      this.handlers.onError(error instanceof Error ? error.message : 'Failed to parse websocket message.');
    }
  }
}

function createRequestId(prefix: string): string {
  requestSequence += 1;
  return `${prefix}_${Date.now()}_${requestSequence}`;
}
