# 管理ブック

携帯番号、契約、利用セット、端末、暗証番号、キャリアアカウントを、
端末内で暗号化して管理するモバイル向けウェブアプリです。

- 静的なHTML/CSS/JavaScriptのみ
- Web Crypto API（非抽出256-bit端末鍵 + AES-256-GCM）
- 絵文字3つのロック操作と暗号鍵を分離
- 暗号文と端末鍵は同一オリジンのIndexedDBに保存
- 外部通信・クラウド同期・バックアップ機能なし
- 回線ごと／端末ごと／利用セットごとの表示
- 同一オリジンにある「回線チェック」のチェック履歴を読み取り可能

## Deploy

「回線チェック」と同じく、リポジトリのルートをそのままGitHub Pagesで
公開できます。ビルド工程やサーバーは不要です。GitHubの
**Settings → Pages** で公開ブランチ（`main`または同内容の`gh-pages`）と
`/(root)`を選択してください。

暗号化保存にはSecure Contextが必要なため、実運用はGitHub PagesのHTTPSで
行ってください。ローカル確認では `python3 -m http.server 8080` を使えます。

保存形式と回線チェック連携は [`DATA_FORMAT.md`](DATA_FORMAT.md)、暗号化の設計と限界は [`SECURITY.md`](SECURITY.md) を参照してください。
