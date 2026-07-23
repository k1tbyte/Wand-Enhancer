<div align="center">

![logo](./assets/icon.svg)

# WandEnhancer

[![GitLab Mirror](https://img.shields.io/badge/GitLab-mirror-fc6d26?logo=gitlab)](https://gitlab.com/kitbyte/wand-enhancer)

</div>

[English](README.md) · 简体中文 · [日本語](README.ja.md)

<h4>一个开源互操作工具，旨在扩展本地客户端配置并改善 Wand 应用的用户体验。</h4>

**🚨 重要提示：本项目没有任何官方 YouTube 教程、指南或预编译可执行文件下载。🚨
本项目没有展示安装或使用方法的官方视频。诈骗者正在冒用本项目名称制作虚假教程，并在视频说明中放置恶意软件或密码窃取程序。GitHub 官方 Release 只包含发行说明，不包含 `.exe` 文件。如果你从 YouTube 链接、随机网站或第三方镜像下载了 `.exe` 或压缩包，它就不是本项目提供的文件。本项目不对第三方下载负责。**

## 👾 它会访问哪些内容？

.NET 补丁程序会修改所选本地 Wand 安装目录中的文件，并且不会连接更新或遥测服务。随附的 `version.dll` 代理由 Wand 加载，并在 Wand 自身进程内修改 Electron 的 ASAR 完整性熔丝字节；它不会注入其他进程。Wand 本身仍是在线应用，构建工具会还原已声明的依赖项，而可选的远程 Web 面板会有意启动局域网 HTTP/WebSocket 服务器，并使用 Wand API/CDN 数据。请审查源码，并从自己的分支构建可执行文件；未签名的补丁工具可能触发通用的杀毒软件启发式检测。

## 💫 改进了哪些功能？

✅ 本地环境配置管理 <br/>
✅ 针对新客户端版本自动进行兼容性调整 <br/>
✅ 高级布局和主题自定义（仅限客户端）<br/>
✅ AI 功能 <br/>
✅ 远程 Web 面板（在移动设备上远程连接）<br/>

## 🌐 远程 Web 面板
WandEnhancer 内置了**远程 Web 面板**，可让你直接通过手机控制应用功能。

### 快速开始：
1. 确保电脑和手机连接到**同一个 Wi-Fi 网络**。
2. 将鼠标悬停在 WandEnhancer 顶栏的 **Connect** 按钮上。
3. 使用手机相机扫描显示的**二维码**。

### 故障排查与远程访问：
- **页面无法加载？** 首先确认电脑和手机连接到**同一个本地网络**。某些路由器和访客 Wi-Fi 会启用客户端隔离/AP 隔离，导致同一 SSID 下的设备无法互相访问。如果仍无法加载，请检查 Windows 防火墙，并允许本地网络上的 TCP 端口 `3223` 接收入站流量。如果 Windows 将网络连接标记为**公用**，切换为**专用**也可能有帮助。
- **正在使用移动数据或其他网络？** 如果要通过移动数据（LTE/5G）或完全不同的网络使用面板，可以使用 [Tailscale](https://tailscale.com/) 或类似的 VPN 工具。
- 面板在端口 `3223` 上使用明文 HTTP，并且没有配对码。任何能够访问该端口的人都可以查看面板并控制当前修改器，因此只能在受信任的局域网/VPN 中使用，绝不要将该端口直接暴露到互联网。
- 面板协议不包含 Wand Bearer Token 或安装路径字段。

## 👀 如何使用？

本仓库不发布官方编译好的二进制文件。请使用 GitHub Actions，从自己的分支构建可执行文件。

1. 登录 GitHub 并 Fork 本仓库。
2. 每次构建前使用 **Sync fork**，确保分支包含最新修复。
3. 打开自己的分支，进入 **Actions** 标签页；如果 GitHub 提示，请启用工作流。
4. 选择 **Build executable** 工作流。
5. 单击 **Run workflow**，保留默认分支并开始运行。
6. 等待工作流完成，打开已完成的运行并下载构件。
7. 解压构件 ZIP，然后运行 `WandEnhancer.exe` 以应用本地客户端修改。

*操作演示：*

https://github.com/user-attachments/assets/7966cabe-0aa6-424d-8c2f-981ad91e0f91



## 🧩 自定义脚本

你可以在应用补丁时将自己的 JavaScript 注入 Wand，以调整或修复客户端界面。此功能复用远程 Web 面板所用的同一渲染器注入方式，因此必须启用**远程 Web 面板**补丁。

**如何添加脚本**

- 在补丁对话框中添加一个或多个 `.js` 文件（只接受现有的 `.js` 文件），**或者**
- 将 `.js` 文件放入补丁程序可执行文件旁边的 `renderer-scripts/` 文件夹。

之后照常应用补丁——脚本会被打包进客户端，并在 Wand 窗口内运行。

**运行方式**

- 每个脚本都在 Wand 的渲染器中运行（拥有完整 DOM 访问权限，并可使用 Node `require`）。
- 脚本会被包装起来，因此抛出的错误只会记录日志，绝不会导致 Wand 崩溃。
- 每次启动时脚本可能运行**多次**（加载时一次，稍后再运行一次），因此请使用全局标志保护只应执行一次的工作。
- 可使用一个小型 `WandEnhancer` 辅助对象：`WandEnhancer.log(...)`、`WandEnhancer.remoteUrl`、`WandEnhancer.apiVersion`。

**最小示例**（`hello.js`）

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

> 脚本拥有与 Wand 客户端相同的权限。只添加你信任并且理解的脚本。

## 🛠️ 如何从源码构建

在 Windows 上从源码构建需要本地开发环境。

### 要求

- `CMake`
- `Node.js` 和 `pnpm`
- `Visual Studio 2022` 或 `Build Tools for Visual Studio 2022`（需包含 `MSBuild`）
- Visual Studio 的 `Desktop development with C++` 工作负载
- .NET Framework 4.8 桌面构建工具/目标包

### 构建步骤

1. 克隆本仓库。
2. 安装上述要求，并确保可以使用 `cmake`、`pnpm` 和 `MSBuild`。
3. 在命令提示符或 PowerShell 中运行 `build.cmd`。

构建脚本会安装 Web 面板依赖项、构建前端、使用 CMake 编译原生辅助程序、还原 NuGet 包，并构建 WPF 解决方案。

---

## ❓ 问答

- **为什么 GitHub Releases 中没有 `.exe`？**
  - 官方 Release 有意只提供发行说明。项目不再分发预编译可执行文件，因为未签名或自行构建的补丁工具会被第三方反复重新上传、错误标记，并被扫描程序判定为风险。请改用 GitHub Actions，从自己的分支构建可执行文件。
- **在哪里下载可执行文件？**
  - 在自己的分支中运行 **Build executable** 工作流，然后从对应 **Actions** 构件中下载。不要从 YouTube 说明、随机镜像、Discord 附件或 Issue 评论中下载 `.exe` 文件。
- **为什么 Windows Defender 或 SmartScreen 会对我的构建发出警告？**
  - GitHub Actions 构件未经签名且并不常见，因此即使代码直接从你的分支构建，Windows 也可能发出警告。请审查源码、检查工作流日志，并且只运行自己构建的二进制文件。
- **可以使用其他人构建的二进制文件吗？**
  - 可以，但应将其视为不受信任的文件。本仓库无法验证或支持第三方构建。
- **它会向任何地方发送数据吗？**
  - .NET 补丁步骤完全在本地执行。可选的远程 Web 面板会监听局域网，并可能通过 Wand 现有的 API/CDN 路径请求修改器翻译或图片；它不包含更新程序或项目遥测。
- **没有应用内更新检查时，如何得知新版本？**
  - 在 GitHub 上选择 **Watch → Custom → Releases**，然后在发布新版本时同步你的分支并运行 **Build executable**。

---
## 🖼️ 截图
![1](./assets/screenshots/app1.png)
<div align='center'>

![2](./assets/screenshots/app2.png)
</div>

---

## 📜 许可证
本项目采用 Apache-2.0 许可证——详情请参阅 [LICENSE](LICENSE.md) 文件。

---
## ❤️ 支持

如果你觉得本项目有用，可以通过以下任一方式支持项目开发 🙌

[![Patreon](https://img.shields.io/badge/Patreon-donate-f96854.svg?logo=patreon)](https://www.patreon.com/kitbyte/gift)
[![USDT TRC20](https://img.shields.io/badge/USDT--TRC20-donate-26a17b.svg?logo=tether)](https://tronscan.org/#/address/TQdvau8pAy5Tg1Aa588tTcPCFgbcHtuoxc)
[![BTC](https://img.shields.io/badge/BTC-donate-f7931a.svg?logo=bitcoin)](https://www.blockchain.com/explorer/addresses/btc/1EZKDcyU8REm9JW5xwXJqSpn5Xaq5yAWWX)
[![ETH](https://img.shields.io/badge/ETH-donate-3c3c3d.svg?logo=ethereum)](https://etherscan.io/address/0xd904d9d0557f88bbb1c4ab3582b4ca0d8a730e8d)


---

> **法律免责声明：**
> 本项目是第三方增强工具，仅用于教育、研究和本地互操作用途。它不分发任何专有代码，也不绕过服务端验证。所有修改都在本地执行，仅用于自定义用户界面。

---

[![Star History Chart](https://api.star-history.com/svg?repos=k1tbyte/Wand-Enhancer&type=Date)](https://www.star-history.com/#k1tbyte/Wand-Enhancer&Date)
