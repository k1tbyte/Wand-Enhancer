(function installIpcLogger(WandEnhancer) {
  if (globalThis.__wandIpcLoggerInstalled) {
    return;
  }

  globalThis.__wandIpcLoggerInstalled = true;

  try {
    const electron = window.require ? window.require('electron') : null;
    if (!electron || !electron.ipcRenderer) {
      console.warn('[WandEnhancer] ipc-logger: electron.ipcRenderer not found. Node integration might be disabled or hidden behind contextBridge.');
      return;
    }

    const { ipcRenderer } = electron;
    
    // Backup original methods
    const originalInvoke = ipcRenderer.invoke.bind(ipcRenderer);
    const originalSend = ipcRenderer.send.bind(ipcRenderer);
    
    // Hook invoke (Promises)
    ipcRenderer.invoke = async function (channel, ...args) {
      const startTime = performance.now();
      try {
        const result = await originalInvoke(channel, ...args);
        const duration = (performance.now() - startTime).toFixed(1);
        console.log(`%c[IPC INVOKE]%c ${channel} %c(${duration}ms) =>`, 'color: #00c7f2; font-weight: bold;', 'color: white;', 'color: gray;', { args, result });
        return result;
      } catch (err) {
        console.error(`%c[IPC INVOKE ERROR]%c ${channel} =>`, 'color: #ff0056; font-weight: bold;', 'color: white;', { args, err });
        throw err;
      }
    };

    // Hook send (Fire & Forget)
    ipcRenderer.send = function (channel, ...args) {
      console.log(`%c[IPC SEND]%c ${channel} =>`, 'color: #acff35; font-weight: bold;', 'color: white;', { args });
      return originalSend(channel, ...args);
    };

    console.log('%c[WandEnhancer]%c IPC Logger installed successfully! Use Ctrl+Shift+D to view logs.', 'color: #1293ff; font-weight: bold;', 'color: inherit;');

  } catch (err) {
    console.error('[WandEnhancer] Failed to hook IPC:', err);
  }
})(globalThis.WandEnhancer);
