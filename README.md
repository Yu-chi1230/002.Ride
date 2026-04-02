# Ride

Ride は、バイク利用者向けのルート生成、車両管理、健康診断、画像生成、問い合わせ連携を扱うアプリケーションです。  
このリポジトリは frontend / backend / Supabase ローカル環境 / テスト仕様書と結果をまとめて管理します。

## 構成
- `frontend/`
  - React + Vite のフロントエンド
- `backend/`
  - Express + Prisma + Supabase Auth を使う API
- `supabase/`
  - Supabase ローカル環境用設定、SQL、補助ファイル
- `docs/`
  - 要件、DB 定義、テスト仕様書、テスト結果
- `agents/`
  - 役割別の作業ルール
- `shared/`
  - コンテナ間共有領域

## 開発環境
- frontend container: `002ride-frontend-1`
- backend container: `002ride-backend-1`
- network: `002ride_default`
- frontend URL: `http://localhost:5174`
- backend URL: `http://localhost:8001`

このリポジトリでは、ローカルホストへ直接依存関係を入れず、コンテナ上で作業する前提です。

## 起動
ルートの `docker-compose.yml` を使います。

```bash
docker compose up --build
```

起動時の挙動:
- backend
  - `npx prisma generate && npm run dev`
- frontend
  - `vite --host 0.0.0.0 --port 5174`

## 主要コマンド
backend:

```bash
docker exec -it 002ride-backend-1 npm run dev
docker exec -it 002ride-backend-1 npm run test:unit
docker exec -it 002ride-backend-1 npm run build
```

frontend:

```bash
docker exec -it 002ride-frontend-1 npm run dev
docker exec -it 002ride-frontend-1 npm run test:unit
docker exec -it 002ride-frontend-1 npm run build
```

## 環境変数
実値は Git 管理しません。以下のようなキーを `.env` 系ファイルで設定して利用します。

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_CLOUD_VISION_API_KEY`
- `NOTION_TOKEN`
- `NOTION_CONTACT_DATABASE_ID`
- `NOTION_ANNOUNCEMENT_DATABASE_ID`

## テスト関連
テスト仕様書と結果は `docs/tests/` 配下にあります。

- 仕様書
  - `docs/tests/specification/`
- 結果
  - `docs/tests/result/`

補助スクリプト例:
- `backend/ride_system_test.js`
- `backend/security_test.js`

## 作業ルール
共通ルールは [AGENTS.md](/Users/yusn/Documents/10.AiDev/002.Ride/AGENTS.md) を参照してください。

重要な前提:
- 変更前に関連ファイルと既存実装を読む
- 作業前に計画を提示し、了承後に進める
- ライブラリのインストールや実行確認はコンテナ上で行う
- ホスト環境へ直接関与しない

役割別ルール:
- レビュー: `agents/reviewer.md`
- 実装: `agents/implementer.md`
- 設計: `agents/planner.md`
- セキュリティテスト: `agents/SECer.md`
- システムテスト: `agents/STer.md`

## 注意
- `supabase/volumes/db/data/` のようなローカル実行データは Git 管理対象外です。
- `.env` 系ファイルに API key や token を直書きし、Git 管理対象ファイルへ転記しないでください。
- `docker-compose.yml` や `supabase/` 配下は構成管理対象のため、環境変数参照のまま維持してください。
