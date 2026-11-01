<div align="center">

![logo](./assets/icon.svg)

# WandEnhancer

[![GitLab Mirror](https://img.shields.io/badge/GitLab-mirror-fc6d26?logo=gitlab)](https://gitlab.com/kitbyte/wand-enhancer)

</div>

An open-source tool that extends the local client-side configuration of the Wand app and improves its UX.

> **This project has no official downloads and no official video tutorials.** GitHub releases contain notes only, never `.exe` files. Scammers use the project's name for fake tutorials and put malware or password stealers in the video descriptions. An executable or archive from a video, a website or a mirror did not come from this project, and we are not responsible for it. The official sources are this repository and its GitLab mirror. Look-alike forks and accounts are not ours.

## Features

- Local environment configuration management
- Automated compatibility adjustments for new client versions
- Layout and theme customization (client side only)
- AI features
- Remote web panel: control Wand from your phone

## Network and privacy

The patcher modifies files in the selected local Wand installation. By default it has no update check and no telemetry. Wand itself stays an online application. The optional remote web panel starts a LAN HTTP/WebSocket server and uses Wand API and CDN data, such as trainer translations and artwork.

An opt-in build variant checks GitHub's latest public release when Wand starts. That request exposes your IP and User-Agent, sends no Wand or account data, and never downloads an update.

## How to use

The project publishes no prebuilt executables. You build your own in your fork with GitHub Actions:

1. Fork this repository and click **Sync fork** before each build, so your fork has the latest fixes.
2. Open the **Actions** tab of your fork and enable workflows if GitHub asks.
3. Select the **Build executable** workflow and click **Run workflow**. Leave "Include GitHub release checks when Wand starts" off for a fully offline patcher, or turn it on to compile in new-version notifications.
4. When the run finishes, download the artifact from it and extract the zip.
5. Run `WandEnhancer.exe`. If your Wand install is not detected, drag its folder (or `Wand.exe`) onto the window.

Video walkthrough:

https://github.com/user-attachments/assets/7966cabe-0aa6-424d-8c2f-981ad91e0f91

You do not need a pull request to this repository to build your fork. `master` is the stable source. When you report a problem, give the workflow's source commit SHA and not only the version number: builds of one version can contain different fixes.

## Troubleshooting

Two causes account for most reports. Check them before opening an issue.

**Pro or mods stop working after a day or two.** Wand updates itself in the background, and the new version is not patched. Run Restore, then Patch again. To stop repeating this, enable **Auto-apply after updates** or **Disable updates** in the patch dialog.

**Wand does not open, or patched files disappear.** Patched Wand files are modified and unsigned, and the `WandEnhancer.exe` you build is unsigned and uncommon. Antivirus products and SmartScreen can flag both, even when the code was built from your own fork.

- SmartScreen on `WandEnhancer.exe`: choose **More info**, then **Run anyway**, if you built the file yourself.
- Open Windows Security, **Virus & threat protection**, **Protection history**, and restore any quarantined Wand or WandEnhancer files.
- Add exclusions for the Wand folder (usually `%LOCALAPPDATA%\Wand`) and for the folder with `WandEnhancer.exe`, then patch again.
- With a third-party antivirus, do the same in its quarantine and exclusion settings.

Run only binaries you built yourself, and review the source first.

## Reporting a problem

Open a [bug report](../../issues/new?template=bug_report.yml) and attach logs. Reports without logs are hard to investigate and may be closed.

1. `launcher.log` and `launcher.prev.log` from the Wand installation root (usually `%LOCALAPPDATA%\Wand`). They record the build commit and the applied patches, and help the most.
2. The enhancer log: click **Copy logs to clipboard** in the WandEnhancer window right after the failure and paste it.
3. The exact Wand version and channel (stable or beta), the enhancer version, the selected patches, and whether it happened on a fresh install, an update or Restore.

Remove personal paths before sharing. Never attach executables, account tokens or storage dumps. Third-party binaries and stolen accounts are out of scope here.

## Remote web panel

The panel lets you control Wand from your phone.

1. Put the PC and the phone on the same Wi-Fi network.
2. Hover over **Connect** in the top bar of WandEnhancer.
3. Scan the QR code with your phone camera.

If the page does not load:

- Some routers and guest Wi-Fi networks isolate clients (AP isolation), so devices on one network cannot reach each other.
- Allow inbound TCP port `3223` for your local network in Windows Firewall. If Windows marked the connection as Public, switching it to Private can also help.
- To use the panel over mobile data or from another network, use a VPN such as [Tailscale](https://tailscale.com/).

The panel uses plain HTTP on port `3223` and has no pairing code. Anyone who can reach that port can see the panel and control the active trainer. Use it only on a trusted LAN or VPN and never expose the port to the internet. The protocol does not carry your Wand bearer token or installation paths.

## Custom scripts

You can inject your own JavaScript into Wand at patch time. Scripts use the same renderer injection as the remote web panel, so the remote web panel patch must be enabled.

To add a script, pick one or more `.js` files in the patch dialog (only existing `.js` files are accepted), or put them in a `renderer-scripts/` folder next to the patcher executable. Then patch as usual and the scripts are bundled into the client.

- Each script runs in Wand's renderer with full DOM access and Node `require`.
- A thrown error is logged and never crashes Wand.
- A script can run more than once per launch (on load and again shortly after), so guard one-time work with a global flag.
- A small `WandEnhancer` helper is available: `WandEnhancer.log(...)`, `WandEnhancer.remoteUrl` and `WandEnhancer.apiVersion`. See [web-panel/scripts/custom](web-panel/scripts/custom) for an example.

Scripts run with the same privileges as the Wand client. Add only scripts you trust and understand.

## Build from source

You need Windows with Node.js and `pnpm`, Visual Studio 2022 or Build Tools for Visual Studio 2022 with `MSBuild`, and the .NET Framework 4.8 desktop build tools and targeting pack. Clone the repository and run `build.cmd` from Command Prompt or PowerShell.

The script installs dependencies, builds the panel and the WPF app, and runs the checks. The tests use temporary fixtures, not your Wand installation. See [CONTRIBUTING.md](CONTRIBUTING.md) for the rest.

Update notifications are excluded by default. `build.cmd -EnableUpdateNotifications` compiles them in. The check then runs when Wand starts (on by default, toggle in Settings), shows a native Windows notification for a newer release, and opens the release notes when you click it (the release page when only the launcher is running). It never downloads or installs an update.

## FAQ

**Why is there no `.exe` in GitHub Releases?** Unsigned and self-built patching tools were repeatedly reuploaded, mislabeled and flagged by third-party scanners, so the project stopped distributing prebuilt executables. Releases are notes-only on purpose.

**Can I use a binary built by someone else?** Treat it as untrusted. This repository cannot verify or support third-party builds.

**How do I learn about a new version without an in-app update check?** On GitHub choose **Watch**, **Custom**, **Releases**. When a release is published, sync your fork and run **Build executable**. You can also compile in release notifications, see above.

## Screenshots

![1](./assets/screenshots/app1.png)
<div align='center'>

![2](./assets/screenshots/app2.png)
</div>

## License

Apache-2.0, see [LICENSE](LICENSE.md).

## Support

If you find this project useful, you can support its development with any option below.

[![Patreon](https://img.shields.io/badge/Patreon-donate-f96854.svg?logo=patreon)](https://www.patreon.com/kitbyte/gift)
[![USDT TRC20](https://img.shields.io/badge/USDT--TRC20-donate-26a17b.svg?logo=tether)](https://tronscan.org/#/address/TQdvau8pAy5Tg1Aa588tTcPCFgbcHtuoxc)
[![BTC](https://img.shields.io/badge/BTC-donate-f7931a.svg?logo=bitcoin)](https://www.blockchain.com/explorer/addresses/btc/1EZKDcyU8REm9JW5xwXJqSpn5Xaq5yAWWX)
[![ETH](https://img.shields.io/badge/ETH-donate-3c3c3d.svg?logo=ethereum)](https://etherscan.io/address/0xd904d9d0557f88bbb1c4ab3582b4ca0d8a730e8d)

---

> **Legal disclaimer:** This project is a third-party enhancement tool intended solely for educational, research and local interoperability purposes. It does not distribute any proprietary code or bypass server-side validations. All modifications are performed locally to customize the user's interface.
