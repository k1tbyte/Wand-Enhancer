<div align="center">

![logo](./assets/icon.svg)

# WandEnhancer

[![GitLab Mirror](https://img.shields.io/badge/GitLab-mirror-fc6d26?logo=gitlab)](https://gitlab.com/kitbyte/wand-enhancer)
[![VirusTotal](https://img.shields.io/badge/VirusTotal-0/72-brightgreen?logo=virustotal)](https://www.virustotal.com/gui/file/f6897cf583e9f8ea11e0ee4c3fb99b86c50336b28de706e3e0b9181b4e3cf223)

</div>

<h4>An open-source interoperability tool designed to extend local client-side configurations and improve the UX of the Wand application.</h4>

**🚨 IMPORTANT NOTICE: THIS PROJECT HAS NO OFFICIAL YOUTUBE TUTORIALS OR GUIDES. 🚨
There are no official videos showing how to install or use this tool. Scammers are creating fake tutorials using this project's name and placing malware/password stealers in the video descriptions. If you downloaded an .exe or archive from a YouTube link, YOU HAVE DOWNLOADED MALWARE. The only official, safe, and original source for this project is this exact GitHub repository. We are not responsible for third-party downloads.**

## 👾 Is it safe to use?

Yes. This project is entirely open-source, allowing anyone to audit the code. It operates strictly locally, does not require internet access, and makes zero network requests. It simply adjusts local client settings to enhance your user experience.

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

## 👀 How to use?

1. Go to the [Releases](https://github.com/k1tbyte/Wand-Enhancer/releases) page.
2. Download the latest binary release.
3. Run the enhancer to apply local client modifications.

> Source archives are intended for developers who want to build the project locally. They are not prebuilt binaries.

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

- **I applied the configuration but get stuck on 'Loading...'**
  - Just close the application completely and restart it.
- **Does this send data anywhere?**
  - No. All operations are strictly offline and local to your machine. 

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
[![ko-fi](https://www.ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/kitbyte)

---

> **Legal Disclaimer:**
> This project is a third-party enhancement tool intended solely for educational, research, and local interoperability purposes. It does not distribute any proprietary code or bypass server-side validations. All modifications are performed locally to customize the user's interface.

---

[![Star History Chart](https://api.star-history.com/svg?repos=k1tbyte/Wand-Enhancer&type=Date)](https://www.star-history.com/#k1tbyte/Wand-Enhancer&Date)