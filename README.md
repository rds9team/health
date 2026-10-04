# health.rds9.net

rds9 チームのサービス健全性・ボット稼働状態・VPSリソースを可視化するリアルタイム・ステータスダッシュボード（Cloudflare Pages）。

## 主な機能
- **DarkUI準拠**: 漆黒ベース（`#090A0C`）のサイバーモダンUI、アンビエント発光、呼吸するタイポグラフィ
- **リアルタイムメトリクス**:
  - まきぐもぼっと: 監視対象人数（変態数）、参加サーバー数、Ping、稼働時間
  - rds9 Team Bot: 稼働状態、部署ロール自動化、Ping、稼働時間
  - JSON API Gateway (`api.rds9.net`): 集約レイテンシ、CORS対応状態
  - VPS Node: CPU使用率、メモリ使用率、ロードアベレージ、稼働時間
- **自動更新**: 10秒ごとの自動ポーリング & 手動即時リフレッシュ
- **純粋JSON API連携**: `https://api.rds9.net/health` を参照

## デプロイ (Cloudflare Pages)
- ビルドコマンド: 不要（静的SPA）
- ビルド出力ディレクトリ: `/`
- カスタムドメイン: `health.rds9.net`
