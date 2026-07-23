<div align="center">

![logo](./assets/icon.svg)

# WandEnhancer

[![GitLab Mirror](https://img.shields.io/badge/GitLab-mirror-fc6d26?logo=gitlab)](https://gitlab.com/kitbyte/wand-enhancer)

</div>

[English](README.md) · [简体中文](README.zh-CN.md) · 日本語

<h4>ローカルのクライアント設定を拡張し、Wand アプリの UX を改善するためのオープンソース相互運用ツールです。</h4>

**🚨 重要なお知らせ：このプロジェクトには、公式の YouTube チュートリアル、ガイド、ビルド済み実行ファイルのダウンロードはありません。🚨
本ツールのインストール方法や使用方法を紹介する公式動画はありません。詐欺師がプロジェクト名を使った偽のチュートリアルを作成し、動画説明欄にマルウェアやパスワード窃取プログラムを置いています。公式 GitHub Releases にはリリースノートだけがあり、`.exe` ファイルは含まれません。YouTube リンク、無関係な Web サイト、第三者ミラーから `.exe` やアーカイブをダウンロードした場合、それは本プロジェクトが提供したものではありません。第三者からのダウンロードについて、本プロジェクトは責任を負いません。**

## 👾 何にアクセスしますか？

.NET パッチャーは選択したローカル Wand インストール内のファイルを変更し、更新サービスやテレメトリーサービスには接続しません。同梱の `version.dll` プロキシは Wand に読み込まれ、Wand 自身のプロセス内で Electron の ASAR 整合性ヒューズバイトを変更します。別のプロセスへ注入することはありません。Wand 自体は引き続きオンラインアプリで、ビルドツールは宣言済み依存関係を復元します。また、オプションの Remote Web Panel は意図的に LAN HTTP/WebSocket サーバーを起動し、Wand API/CDN データを使用します。ソースを確認し、自分のフォークから実行ファイルをビルドしてください。署名のないパッチツールは、一般的なウイルス対策のヒューリスティック検出を引き起こす場合があります。

## 💫 どの機能が改善されますか？

✅ ローカル環境設定の管理 <br/>
✅ 新しいクライアントバージョンへの互換性調整を自動化 <br/>
✅ 高度なレイアウトとテーマのカスタマイズ（クライアント側のみ）<br/>
✅ AI 機能 <br/>
✅ Remote Web Panel（モバイルから Remote Connect）<br/>

## 🌐 Remote Web Panel
WandEnhancer には**Remote Web Panel**が組み込まれており、スマートフォンからアプリの機能を直接操作できます。

### クイックスタート：
1. PC とスマートフォンが**同じ Wi-Fi ネットワーク**に接続されていることを確認します。
2. WandEnhancer のトップバーにある **Connect** ボタンへカーソルを合わせます。
3. 表示された **QR コード**をスマートフォンのカメラで読み取ります。

### トラブルシューティングとリモートアクセス：
- **ページを読み込めない場合：**まず、PC とスマートフォンが**同じローカルネットワーク**に接続されていることを確認してください。一部のルーターやゲスト Wi-Fi はクライアント分離/AP 分離を有効にしており、同じ SSID 上の端末同士が通信できません。それでも読み込めない場合は Windows ファイアウォールを確認し、ローカルネットワークから TCP ポート `3223` への受信通信を許可します。Windows が接続を**パブリック**に設定している場合、**プライベート**へ切り替えることでも改善する場合があります。
- **モバイルデータまたは別のネットワークを使用する場合：**モバイルデータ（LTE/5G）やまったく別のネットワークからパネルを使うには、[Tailscale](https://tailscale.com/) などの VPN ツールを利用できます。
- パネルはポート `3223` で平文 HTTP を使用し、ペアリングコードはありません。そのポートへ到達できる人は誰でもパネルを表示して、実行中のトレーナーを操作できます。信頼できる LAN/VPN 上だけで使い、ポートをインターネットへ直接公開しないでください。
- パネルのプロトコルに Wand の Bearer Token やインストールパスのフィールドは含まれません。

## 👀 使い方

このリポジトリは公式のビルド済みバイナリを公開していません。GitHub Actions を使い、自分のフォークから実行ファイルをビルドしてください。

1. GitHub にサインインし、このリポジトリをフォークします。
2. ビルド前に毎回 **Sync fork** を使い、フォークに最新の修正を取り込みます。
3. 自分のフォークを開いて **Actions** タブへ移動し、GitHub から求められた場合はワークフローを有効にします。
4. **Build executable** ワークフローを選択します。
5. **Run workflow** をクリックし、既定のブランチを維持して実行を開始します。
6. ワークフローの完了を待ち、完了した実行を開いてアーティファクトをダウンロードします。
7. アーティファクトの ZIP を展開し、`WandEnhancer.exe` を実行してローカルクライアントへ変更を適用します。

*操作例：*

https://github.com/user-attachments/assets/7966cabe-0aa6-424d-8c2f-981ad91e0f91



## 🧩 カスタムスクリプト

パッチ適用時に独自の JavaScript を Wand へ注入し、クライアント UI を調整または修正できます。この機能は Remote Web Panel と同じレンダラー注入を再利用するため、**Remote Web Panel** パッチを有効にする必要があります。

**スクリプトの追加方法**

- パッチダイアログで 1 つ以上の `.js` ファイルを追加します（実在する `.js` ファイルだけを受け付けます）。**または**
- `.js` ファイルを、パッチャー実行ファイルの隣に置いた `renderer-scripts/` フォルダーへ配置します。

その後は通常どおりパッチを適用してください。スクリプトはクライアントへ組み込まれ、Wand のウィンドウ内で実行されます。

**実行方法**

- 各スクリプトは Wand のレンダラー内で実行されます（DOM への完全なアクセスと Node `require` を利用できます）。
- 例外がスローされてもログに記録され、Wand がクラッシュしないようラップされます。
- 起動ごとに**複数回**（読み込み時と、その少し後）実行される場合があるため、1 回だけ行う処理はグローバルフラグで保護してください。
- 小さな `WandEnhancer` ヘルパーを利用できます：`WandEnhancer.log(...)`、`WandEnhancer.remoteUrl`、`WandEnhancer.apiVersion`。

**最小例**（`hello.js`）

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

> スクリプトは Wand クライアントと同じ権限で実行されます。信頼し、内容を理解しているスクリプトだけを追加してください。

## 🛠️ ソースからのビルド方法

Windows でソースからビルドするには、ローカル開発環境が必要です。

### 要件

- `CMake`
- `Node.js` と `pnpm`
- `Visual Studio 2022` または `Build Tools for Visual Studio 2022`（`MSBuild` を含むもの）
- Visual Studio の `Desktop development with C++` ワークロード
- .NET Framework 4.8 デスクトップビルドツール/ターゲティングパック

### ビルド手順

1. このリポジトリをクローンします。
2. 上記の要件をインストールし、`cmake`、`pnpm`、`MSBuild` が利用可能であることを確認します。
3. コマンドプロンプトまたは PowerShell から `build.cmd` を実行します。

ビルドスクリプトは Web パネルの依存関係をインストールし、フロントエンドをビルドし、CMake でネイティブヘルパーをコンパイルし、NuGet パッケージを復元して WPF ソリューションをビルドします。

---

## ❓ Q&A

- **GitHub Releases に `.exe` がないのはなぜですか？**
  - 公式リリースは意図的にノートだけを提供しています。署名されていない、または自己ビルドされたパッチツールが第三者に繰り返し再アップロードされ、誤った名前を付けられ、第三者スキャナーで警告されているため、プロジェクトはビルド済み実行ファイルを配布していません。代わりに GitHub Actions を使い、自分のフォークから実行ファイルをビルドしてください。
- **実行ファイルはどこからダウンロードしますか？**
  - 自分のフォークで **Build executable** ワークフローを実行した後、その **Actions** アーティファクトからダウンロードします。YouTube の説明欄、無関係なミラー、Discord の添付ファイル、Issue のコメントから `.exe` をダウンロードしないでください。
- **Windows Defender や SmartScreen が自分のビルドに警告するのはなぜですか？**
  - GitHub Actions のアーティファクトは未署名で利用例も少ないため、自分のフォークから直接ビルドしたコードでも Windows が警告する場合があります。ソースを確認し、ワークフローログを検証して、自分でビルドしたバイナリだけを実行してください。
- **他人がビルドしたバイナリを使えますか？**
  - 使用はできますが、信頼できないものとして扱ってください。このリポジトリでは第三者ビルドの検証やサポートはできません。
- **どこかへデータを送信しますか？**
  - .NET のパッチ処理はローカルです。オプションの Remote Web Panel は LAN で待ち受け、Wand 既存の API/CDN 経路を通じてトレーナーの翻訳や画像を要求する場合があります。アップデーターやプロジェクトのテレメトリーは含みません。
- **アプリ内の更新確認なしで新しいバージョンを知るには？**
  - GitHub で **Watch → Custom → Releases** を選び、リリース公開時にフォークを同期して **Build executable** を実行します。

---
## 🖼️ スクリーンショット
![1](./assets/screenshots/app1.png)
<div align='center'>

![2](./assets/screenshots/app2.png)
</div>

---

## 📜 ライセンス
本プロジェクトは Apache-2.0 の下でライセンスされています。詳しくは [LICENSE](LICENSE.md) ファイルを参照してください。

---
## ❤️ サポート

このプロジェクトが役立った場合は、以下のいずれかの方法で開発を支援できます 🙌

[![Patreon](https://img.shields.io/badge/Patreon-donate-f96854.svg?logo=patreon)](https://www.patreon.com/kitbyte/gift)
[![USDT TRC20](https://img.shields.io/badge/USDT--TRC20-donate-26a17b.svg?logo=tether)](https://tronscan.org/#/address/TQdvau8pAy5Tg1Aa588tTcPCFgbcHtuoxc)
[![BTC](https://img.shields.io/badge/BTC-donate-f7931a.svg?logo=bitcoin)](https://www.blockchain.com/explorer/addresses/btc/1EZKDcyU8REm9JW5xwXJqSpn5Xaq5yAWWX)
[![ETH](https://img.shields.io/badge/ETH-donate-3c3c3d.svg?logo=ethereum)](https://etherscan.io/address/0xd904d9d0557f88bbb1c4ab3582b4ca0d8a730e8d)


---

> **法的免責事項：**
> 本プロジェクトは、教育、研究、ローカルでの相互運用だけを目的とする第三者製の拡張ツールです。独自コードを配布せず、サーバー側の検証を回避しません。すべての変更はユーザーインターフェースをカスタマイズするため、ローカルで実行されます。

---

[![Star History Chart](https://api.star-history.com/svg?repos=k1tbyte/Wand-Enhancer&type=Date)](https://www.star-history.com/#k1tbyte/Wand-Enhancer&Date)
