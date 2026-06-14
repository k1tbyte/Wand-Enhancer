export type BridgeOptions = {
    host?: string;
    logFile?: string;
    maxPort?: number | string;
    panelRoot?: string;
    port?: number | string;
    scriptsRoot?: string;
};

export type WebContentsPort = {
    executeJavaScript(source: string, userGesture?: boolean): Promise<unknown>;
    isDestroyed(): boolean;
    on(event: string, listener: () => void): void;
    send(channel: string, payload: unknown): void;
};

export type ElectronPort = {
    app: {
        on(event: 'web-contents-created', listener: (event: unknown, contents: WebContentsPort) => void): void;
    };
    ipcMain: {
        handle(channel: string, handler: (event: { sender?: WebContentsPort }, payload?: unknown) => unknown): void;
    };
};
