import {
  getWebpackRequire,
  isRecord,
} from "./installed-apps-sync/runtime.js"

;(function installRemotePopupCleanup(WandEnhancer) {
  if (globalThis.__wandRemotePopupCleanupInstalled) {
    return
  }

  globalThis.__wandRemotePopupCleanupInstalled = true

  const style = document.createElement("style")
  style.id = "wand-remote-popup-cleanup-style"
  style.textContent = `
    article.pro-onboarding-card--remote {
      display: none !important;
    }

    remote-tooltip .remote-tooltip .top-wrapper,
    remote-tooltip .remote-tooltip .remote-tooltip-section-divider,
    remote-tooltip .remote-tooltip .instructions .header,
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
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      gap: 12px !important;
    }

    remote-tooltip .remote-tooltip .instructions remote-qr-code {
      --wand-qr-size: clamp(180px, 70vw, 240px);
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

    remote-tooltip .remote-tooltip .instructions .content .text {
      display: block !important;
      max-width: 250px !important;
      overflow-wrap: anywhere !important;
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
  `
  let qrRenderer = null
  let refreshScheduled = false

  const installStyle = () => {
    if (!document.getElementById(style.id)) {
      document.head.appendChild(style)
    }
  }

  const getRemoteUrl = () =>
    globalThis.__wandRemoteBridgeUrl || WandEnhancer?.remoteUrl

  const resolveQrRenderer = () => {
    if (qrRenderer) {
      return qrRenderer
    }

    const webpackRequire = getWebpackRequire()
    for (const record of Object.values(webpackRequire?.c || {})) {
      const exports = record?.exports
      if (
        isRecord(exports) &&
        typeof exports.create === "function" &&
        typeof exports.mo === "function"
      ) {
        qrRenderer = exports.mo
        return qrRenderer
      }
    }

    return null
  }

  const updateLinks = (remoteUrl) => {
    if (!remoteUrl) {
      return
    }

    for (const anchor of document.querySelectorAll("remote-tooltip a[href]")) {
      anchor.setAttribute("href", remoteUrl)
      anchor.textContent = remoteUrl.replace(/\/$/, "")
    }
  }

  const updateQrCodes = async (remoteUrl) => {
    const renderQr = remoteUrl && resolveQrRenderer()
    if (!renderQr) {
      return
    }

    for (const canvas of document.querySelectorAll("remote-qr-code canvas")) {
      if (canvas.dataset.wandRemoteUrl === remoteUrl) {
        continue
      }

      try {
        await renderQr(canvas, remoteUrl)
        canvas.dataset.wandRemoteUrl = remoteUrl
      } catch (error) {
        WandEnhancer?.log("Failed to render local remote QR code", error)
      }
    }
  }

  const refresh = () => {
    const remoteUrl = getRemoteUrl()
    installStyle()
    updateLinks(remoteUrl)
    void updateQrCodes(remoteUrl)
  }

  const scheduleRefresh = () => {
    if (refreshScheduled) {
      return
    }

    refreshScheduled = true
    setTimeout(() => {
      refreshScheduled = false
      refresh()
    }, 0)
  }

  refresh()

  const observer = new MutationObserver(scheduleRefresh)

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
})(globalThis.WandEnhancer)
