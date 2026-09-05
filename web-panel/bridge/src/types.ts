import type { Socket } from 'node:net';

/**
 * Shared vocabulary for the bridge runtime. Payloads crossing the Wand renderer
 * IPC boundary are genuinely unknown until a normalizer validates them, so they
 * are typed `unknown` and narrowed there - not `any`.
 */

export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

export type UnknownRecord = Record<string, unknown>;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFn = (level: LogLevel, message: string, error?: unknown) => void;

/** One connected websocket peer. */
export type BridgeClient = {
    socket: Socket;
    buffer: Buffer;
    closed: boolean;
    draining: boolean;
    handshaken: boolean;
};

export type BridgeOptions = {
    logFile?: string;
    port?: number;
    maxPort?: number;
    host?: string;
    panelRoot?: string;
};

export type ServerInfo = {
    port: number;
    advertisedUrls: string[];
};

/** A decoded websocket frame. */
export type WsFrame = {
    opcode: number;
    payload: Buffer;
    rest: Buffer;
};

export interface BridgeLogger extends LogFn {
    file: string;
}

/**
 * Minimal structural views of the Electron objects the bridge touches. Declared here
 * rather than in each consumer: `@types/electron` is not a dependency, and the runtime
 * modules use `module.exports`, which esbuild disables in any file carrying an `export`.
 */
export type WebContentsPort = {
    isDestroyed(): boolean;
    send(channel: string, ...args: unknown[]): void;
    executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
    on(event: 'dom-ready' | 'did-finish-load', listener: () => void): void;
    /** Optional in Electron's older typings; guarded at every call site. */
    once?(event: 'destroyed', listener: () => void): void;
};

export type IpcMainEventPort = {
    sender?: WebContentsPort;
};

export type IpcMainPort = {
    handle(
        channel: string,
        listener: (event: IpcMainEventPort, payload?: unknown) => unknown,
    ): void;
};

export type AppPort = {
    on(
        event: 'web-contents-created',
        listener: (event: unknown, contents: WebContentsPort) => void,
    ): void;
};

export type ElectronPort = {
    app: AppPort;
    ipcMain: IpcMainPort;
};
