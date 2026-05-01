import { CLIENT_VERSION } from './constants';
import {
  type HelloMessage,
  type IncomingMessage,
  type OutgoingMessage,
  PROTOCOL_VERSION,
  type SetValueMessage,
  isIncomingMessage,
} from './protocol';

type SocketHandlers = {
  onConnecting: () => void;
  onOpen: () => void;
  onMessage: (message: IncomingMessage) => void;
  onClose: () => void;
  onError: (message: string) => void;
};

export class PanelSocketClient {
  private socket: WebSocket | null = null;
  private intentionalDisconnect = false;

  constructor(
    private readonly url: string,
    private readonly handlers: SocketHandlers,
  ) {}

  connect(pairingToken?: string): void {
    this.disconnect();
    this.intentionalDisconnect = false;
    this.handlers.onConnecting();

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.handlers.onOpen();
      this.send(this.createHelloMessage(pairingToken));
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

    socket.addEventListener('error', () => {
      this.handlers.onError('WebSocket connection failed.');
    });
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.socket?.close();
    this.socket = null;
  }

  send(message: OutgoingMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.socket.send(JSON.stringify(message));
    return true;
  }

  setValue(trainerId: string, target: string, value: unknown, cheatId?: string): boolean {
    const message: SetValueMessage = {
      type: 'set_value',
      version: PROTOCOL_VERSION,
      requestId: `set_${target}_${Date.now()}`,
      payload: {
        trainerId,
        target,
        value,
        cheatId,
      },
    };

    return this.send(message);
  }

  private createHelloMessage(pairingToken?: string): HelloMessage {
    return {
      type: 'hello',
      version: PROTOCOL_VERSION,
      requestId: `hello_${Date.now()}`,
      payload: {
        client: 'mobile-web',
        clientVersion: CLIENT_VERSION,
        pairingToken,
        capabilities: {
          supportsDeltaValues: true,
          supportsTrainerSwitch: true,
        },
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
