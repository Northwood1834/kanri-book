# 管理ブック

携帯番号、契約、利用セット、端末、暗証番号、キャリアアカウントを、
端末内で暗号化して管理するモバイル向けウェブアプリです。

- 静的なHTML/CSS/JavaScriptのみ
- Web Crypto API（非抽出256-bit端末鍵 + AES-256-GCM）
- 固定配置の絵文字・数字を0〜3個選べる画面ロックと暗号鍵を分離
- 暗号文と端末鍵は同一オリジンのIndexedDBに保存
- 外部通信・クラウド同期・バックアップ機能なし
- 回線ごと／端末ごと／利用セットごとの表示
- 任意の順、契約日の新旧などによる安全な一覧並び替え
- 主要キャリア・サブブランド・格安SIMのプラン名選択
- キャリア別の見直し日数と契約日からの自動計算
- 同一オリジンにある「回線チェック」のチェック履歴を読み取り可能

## Deploy

公開URL: https://northwood1834.github.io/kanri-book/

「回線チェック」と同じく、リポジトリのルートをそのままGitHub Pagesで
公開できます。ビルド工程やサーバーは不要です。GitHubの
**Settings → Pages** で公開ブランチ（`main`または同内容の`gh-pages`）と
`/(root)`を選択してください。

暗号化保存にはSecure Contextが必要なため、実運用はGitHub PagesのHTTPSで
行ってください。ローカル確認では `python3 -m http.server 8080` を使えます。

保存形式と回線チェック連携は [`DATA_FORMAT.md`](DATA_FORMAT.md)、暗号化の設計と限界は [`SECURITY.md`](SECURITY.md)、共通バックアップと将来のデータ統合は [`BACKUP_DESIGN.md`](BACKUP_DESIGN.md) を参照してください。

## License

`author.png` を除きMIT Licenseです。画像の扱いと公式公開先は
[`NOTICE.md`](NOTICE.md)、出自情報は [`PROVENANCE.md`](PROVENANCE.md) を参照してください。
