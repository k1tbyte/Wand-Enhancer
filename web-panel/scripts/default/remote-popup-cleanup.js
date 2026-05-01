(function installRemotePopupCleanup(WandEnhancer) {
  if (globalThis.__wandRemotePopupCleanupInstalled) {
    return;
  }

  globalThis.__wandRemotePopupCleanupInstalled = true;

  const style = document.createElement('style');
  style.id = 'wand-remote-popup-cleanup-style';
  style.textContent = `
    remote-tooltip .remote-tooltip .top-wrapper,
    remote-tooltip .remote-tooltip .remote-tooltip-section-divider,
    remote-tooltip .remote-tooltip .instructions .header,
    remote-tooltip .remote-tooltip .instructions .content .text,
    remote-tooltip .remote-tooltip .instructions .platforms {
      display: none !important;
    }

    remote-tooltip .remote-tooltip .instructions-wrapper {
      margin: 0 !important;
      padding: 18px !important;
      text-align: center !important;
    }

    remote-tooltip .remote-tooltip .instructions,
    remote-tooltip .remote-tooltip .instructions .content {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      gap: 0 !important;
    }

    remote-tooltip .remote-tooltip .instructions remote-qr-code {
      all: unset !important;
      --wand-qr-size: clamp(220px, 100vw, 300px);
      width: var(--wand-qr-size) !important;
      height: var(--wand-qr-size) !important;
      min-width: var(--wand-qr-size) !important;
      min-height: var(--wand-qr-size) !important;
      max-width: var(--wand-qr-size) !important;
      max-height: var(--wand-qr-size) !important;
      flex: 0 0 var(--wand-qr-size) !important;
      aspect-ratio: 1 / 1 !important;
      display: block !important;
      border-radius: 12px !important;
      overflow: hidden !important;
      transform: none !important;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35) !important;
    }

    remote-tooltip .remote-tooltip .instructions remote-qr-code canvas {
      width: 100% !important;
      height: 100% !important;
      aspect-ratio: 1 / 1 !important;
      display: block !important;
      object-fit: contain !important;
      image-rendering: pixelated !important;
      border-radius: 12px !important;
      transform: none !important;
    }
  `;

  const installStyle = () => {
    if (!document.getElementById(style.id)) {
      document.head.appendChild(style);
    }
  };

  const updateLinks = () => {
    const remoteUrl = globalThis.__wandRemoteBridgeUrl || WandEnhancer?.remoteUrl;
    if (!remoteUrl) {
      return;
    }

    for (const anchor of document.querySelectorAll('remote-tooltip a[href]')) {
      anchor.setAttribute('href', remoteUrl);
      anchor.textContent = remoteUrl.replace(/\/$/, '');
    }
  };

  installStyle();
  updateLinks();

  const observer = new MutationObserver(() => {
    installStyle();
    updateLinks();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})(globalThis.WandEnhancer);
