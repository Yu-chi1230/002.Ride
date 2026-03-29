# Login API 単体テスト結果報告書

## 1. 実施概要

- 対象 API: `POST /api/auth/login`
- 対象テスト: `backend/src/test/loginHandler.spec.ts`
- 実施日時: 2026-03-28 JST
- 実行コマンド: `docker exec 002ride-backend-1 sh -lc 'cd /app && npm run test:unit -- src/test/loginHandler.spec.ts'`
- 実行場所: `002ride-backend-1:/app`

## 2. テスト観点

- メールアドレス正規化
- クライアント IP 抽出
- 必須入力チェック
- ロック中応答
- 認証失敗時の 401 応答
- ロック到達時の 429 応答
- 認証成功時の 200 応答
- 例外時の 500 応答

## 3. テスト実施結果

- 実施結果: 正常終了
- 終了コード: `0`
- Tests: `8 passed / 8 total`
- 実行時間: `549.8405ms`
- 補足: 追加した `backend/package.json` の `test:unit` は `node --test -r ts-node/register` を利用し、外部テストライブラリの追加は行っていない。

## 4. ビルド確認

- 実行コマンド: `docker exec 002ride-backend-1 sh -lc 'cd /app && npm run build'`
- 実施結果: 正常終了
- 終了コード: `0`

## 5. テスト実施結果に紐づく修正対応

- 初回 build では `expires_at` の型が `undefined` を取り得る Supabase 型との差分で失敗した。
- `backend/src/auth/loginHandler.ts` の session 型を `expires_at?: number | null` に修正し、再実行で解消した。

## 6. 未確認事項または残リスク

- 実 DB 更新を伴う `login_attempts` テーブル連携は単体テスト対象外。
- Supabase 実接続はモック化しているため、結合レベルの疎通確認は別途必要。
- Express ルーティング全体を経由する API テストではなく、handler 単位の単体テストである。
