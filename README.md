<div align="center">

![logo](./assets/icon.svg)

# WandEnhancer

[![GitLab Mirror](https://img.shields.io/badge/GitLab-mirror-fc6d26?logo=gitlab)](https://gitlab.com/kitbyte/wand-enhancer)

</div>

<h4>An open-source interoperability tool designed to extend local client-side configurations and improve the UX of the Wand application.</h4>

**🚨 IMPORTANT NOTICE: THIS PROJECT HAS NO OFFICIAL YOUTUBE TUTORIALS, GUIDES, OR PREBUILT EXECUTABLE DOWNLOADS. 🚨
There are no official videos showing how to install or use this tool. Scammers are creating fake tutorials using this project's name and placing malware/password stealers in the video descriptions. Official GitHub releases contain release notes only, not `.exe` files. If you downloaded an `.exe` or archive from a YouTube link, a random website, or a third-party mirror, you did not get it from this project. We are not responsible for third-party downloads.**

## 👾 What does it access?

The .NET patcher modifies files in the selected local Wand installation and does not contact an update or telemetry service. The bundled `version.dll` proxy is loaded by Wand and changes Electron's ASAR-integrity fuse byte inside Wand's own process; it does not inject into another process. Wand itself remains an online application, build tools restore declared dependencies, and the optional Remote Web Panel deliberately starts a LAN HTTP/WebSocket server and uses Wand API/CDN data. Review the source and build the executable from your own fork; unsigned patching tools can trigger generic antivirus heuristics.

## 💫 What features are improved?

✅ Local environment configuration management <br/>
✅ Automated compatibility adjustments for new client versions <br/>
✅ Advanced layout and theme customization (Client-side only) <br/>
✅ AI Features <br/>
✅ Remote web panel (Remote Connect on mobile) <br/>

## 🌐 Remote Web Panel
WandEnhancer includes a built-in **Remote Web Panel** allowing you to control app features directly from your phone.

### Quick Start:
1. Ensure both your PC and phone are on the **same Wi-Fi network**.
2. Hover over the **Connect** button in the top bar of WandEnhancer.
3. Scan the displayed **QR code** with your phone's camera.

### Troubleshooting & Remote Access:
- **Page isn't loading?** First, ensure both your PC and phone are connected to the **same local network**. Some routers and guest Wi-Fi networks enable client isolation/AP isolation, which blocks devices on the same SSID from reaching each other. If it still does not load, check Windows Firewall and allow inbound traffic on TCP port `3223` for your local network. If Windows marked your connection as **Public**, switching it to **Private** can also help.
- **Using mobile data or a different network?** If you want to use the panel over mobile data (LTE/5G) or from an entirely different network, you can use [Tailscale](https://tailscale.com/) or similar VPN tools.
- The panel uses plain HTTP on port `3223` and has no pairing code. Anyone who can reach that port can view the panel and control the active trainer, so use it only on a trusted LAN/VPN and never expose the port directly to the internet.
- The panel protocol does not include your Wand bearer token or installation-path fields.

## 👀 How to use?

This repository does not publish official compiled binaries. Build your own executable from your own fork using GitHub Actions.

1. Sign in to GitHub and fork this repository.
2. Use **Sync fork** before each build so your fork contains the latest fixes.
3. Open your fork, go to the **Actions** tab, and enable workflows if GitHub asks you to.
4. Select the **Build executable** workflow.
5. Click **Run workflow**, keep the default branch, and start the run.
6. Wait for the workflow to finish, open the completed run, and download the artifact.
7. Extract the artifact zip and run `WandEnhancer.exe` to apply local client modifications.

*Here how you do it:*

https://github.com/user-attachments/assets/7966cabe-0aa6-424d-8c2f-981ad91e0f91



## 🧩 Custom scripts

You can inject your own JavaScript into Wand at patch time to tweak or fix things in the client UI. This reuses the same renderer injection the Remote Web Panel uses, so it requires the **Remote Web Panel** patch to be enabled.

**How to add a script**

- In the patch dialog, add one or more `.js` files (only existing `.js` files are accepted), **or**
- Drop `.js` files into a `renderer-scripts/` folder placed next to the patcher executable.

Then patch as usual — your scripts are bundled into the client and run inside Wand's window.

**How it runs**

- Each script runs inside Wand's renderer (full DOM access, plus Node `require`).
- It is wrapped so a thrown error is logged and never crashes Wand.
- It may run **more than once** per launch (on load and again shortly after), so guard one‑time work behind a global flag.
- A small `WandEnhancer` helper is available: `WandEnhancer.log(...)`, `WandEnhancer.remoteUrl`, `WandEnhancer.apiVersion`.

**Minimal example** (`hello.js`)

```js
// Injected scripts can run multiple times — guard one-time setup.
if (!globalThis.__helloScriptInstalled) {
  globalThis.__helloScriptInstalled = true;

  WandEnhancer.log("Hello from my custom script!", WandEnhancer.remoteUrl);

  new MutationObserver(() => {
    const dialog = document.querySelector("ux-dialog:not([data-seen])");
    if (dialog) {
      dialog.setAttribute("data-seen", "1");
      WandEnhancer.log("A dialog opened.");
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
```

> Scripts run with the same privileges as the Wand client. Only add scripts you trust and understand.

## 🛠️ How to build from source

Building from source on Windows requires a local development environment.

### Requirements

- `CMake`
- `Node.js` and `pnpm`
- `Visual Studio 2022` or `Build Tools for Visual Studio 2022` with `MSBuild`
- Visual Studio `Desktop development with C++` workload
- .NET Framework 4.8 desktop build tools / targeting pack

### Build steps

1. Clone this repository.
2. Install the requirements above and make sure `cmake`, `pnpm`, and `MSBuild` are available.
3. Run `build.cmd` from Command Prompt or PowerShell.

The build script installs the web panel dependencies, builds the frontend, compiles the native helper with CMake, restores NuGet packages, and builds the WPF solution.

---

## ❓ Q&A

- **Why is there no `.exe` in GitHub Releases?**
  - Official releases are notes-only on purpose. The project no longer distributes prebuilt executables because unsigned or self-built patching tools are repeatedly reuploaded, mislabeled, and flagged by third-party scanners. Build the executable from your own fork using GitHub Actions instead.
- **Where do I download the executable?**
  - From your own fork's **Actions** artifact after running the **Build executable** workflow. Do not download `.exe` files from YouTube descriptions, random mirrors, Discord attachments, or issue comments.
- **Why does Windows Defender or SmartScreen warn about my build?**
  - The GitHub Actions artifact is unsigned and uncommon, so Windows may warn even when the code was built directly from your fork. Review the source, verify the workflow logs, and only run binaries you built yourself.
- **Can I use a binary built by someone else?**
  - You can, but you should treat it as untrusted. This repository cannot verify or support third-party builds.
- **Does this send data anywhere?**
  - The .NET patching step is local. The optional Remote Web Panel listens on your LAN and may request trainer translations/artwork through Wand's existing API/CDN paths; it does not include an updater or project telemetry.
- **How do I learn about a new version without an in-app update check?**
  - On GitHub choose **Watch → Custom → Releases**, then sync your fork and run **Build executable** when a release is published.

---
## 🖼️ Screenshots
![1](./assets/screenshots/app1.png)
<div align='center'>

![2](./assets/screenshots/app2.png)
</div>

---

## 📜 License
This project is licensed under the Apache-2.0 - see the [LICENSE](LICENSE.md) file for details.

---
## ❤️ Support

If you find this project useful, you can support its development using any of the options below 🙌

[![Patreon](https://img.shields.io/badge/Patreon-donate-f96854.svg?logo=patreon)](https://www.patreon.com/kitbyte/gift)
[![USDT TRC20](https://img.shields.io/badge/USDT--TRC20-donate-26a17b.svg?logo=tether)](https://tronscan.org/#/address/TQdvau8pAy5Tg1Aa588tTcPCFgbcHtuoxc)
[![BTC](https://img.shields.io/badge/BTC-donate-f7931a.svg?logo=bitcoin)](https://www.blockchain.com/explorer/addresses/btc/1EZKDcyU8REm9JW5xwXJqSpn5Xaq5yAWWX)
[![ETH](https://img.shields.io/badge/ETH-donate-3c3c3d.svg?logo=ethereum)](https://etherscan.io/address/0xd904d9d0557f88bbb1c4ab3582b4ca0d8a730e8d)


---

> **Legal Disclaimer:**
> This project is a third-party enhancement tool intended solely for educational, research, and local interoperability purposes. It does not distribute any proprietary code or bypass server-side validations. All modifications are performed locally to customize the user's interface.

---

[![Star History Chart](https://api.star-history.com/svg?repos=k1tbyte/Wand-Enhancer&type=Date)](https://www.star-history.com/#k1tbyte/Wand-Enhancer&Date)
