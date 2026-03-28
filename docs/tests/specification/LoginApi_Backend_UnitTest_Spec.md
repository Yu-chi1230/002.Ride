# Login API 単体テスト仕様書

## 1. 目的

backend の `/api/auth/login` について、認証処理の正常系・異常系・ログイン試行回数制限を単体テストで安定確認できる状態にする。

対象実装:
- `backend/src/auth/loginHandler.ts`
- `backend/server.ts`

## 2. テスト対象範囲

本仕様書で扱う範囲:
- メールアドレス正規化
- クライアント IP 抽出
- 必須入力チェック
- 既存ロック中の拒否
- 認証失敗時の 401 応答
- 失敗回数到達時の 429 応答
- 認証成功時の 200 応答
- 予期しない例外時の 500 応答

本仕様書で扱わない範囲:
- Supabase 実環境との疎通
- PostgreSQL の実テーブル更新成否
- Express サーバー起動確認
- E2E レベルの認証フロー通し確認

## 3. 前提条件

- テストは backend コンテナ `002ride-backend-1` 内で実行する。
- テストランナーは Node.js 組み込みの `node:test` を使用する。
- TypeScript 実行には既存依存の `ts-node/register` を使用する。
- Supabase 認証、ログイン試行回数取得・更新は依存注入でモック化する。

## 4. モック方針

対象:
- `signInWithPassword`
- `getLoginAttemptState`
- `recordLoginFailure`
- `resetLoginAttempts`
- `logError`

基本方針:
- 認証成功時は `session` と `user` を返す。
- 認証失敗時は `error` を返す。
- ロック系は `locked_until` を固定値で返す。
- 例外系は `signInWithPassword` に例外送出させる。

## 5. テスト観点一覧

| ID | 観点 | 概要 |
| --- | --- | --- |
| BLA-UT-001 | メール正規化 | trim と lower-case 変換を行う |
| BLA-UT-002 | IP 抽出 | `x-forwarded-for` 優先、IPv6 プレフィックス除去を行う |
| BLA-UT-003 | 必須入力 | email または password 不足時に 400 を返す |
| BLA-UT-004 | 既存ロック | ロック中なら認証処理前に 429 を返す |
| BLA-UT-005 | 認証失敗 | 認証失敗時に 401 を返し、失敗回数更新を呼ぶ |
| BLA-UT-006 | ロック到達 | 失敗回数更新結果がロックなら 429 を返す |
| BLA-UT-007 | 認証成功 | 200 と session を返し、失敗回数をリセットする |
| BLA-UT-008 | 例外処理 | 予期しない例外時に 500 を返し、エラーログを呼ぶ |

## 6. 詳細テストケース

### BLA-UT-001 メール正規化

- 実施手順:
  1. `normalizeEmail('  Test@Example.COM  ')` を実行する。
  2. `normalizeEmail(null)` を実行する。
- 期待結果:
  1. 1件目は `test@example.com` を返す。
  2. 2件目は空文字を返す。

### BLA-UT-002 IP 抽出

- 実施手順:
  1. `x-forwarded-for` を含む request を渡す。
  2. `remoteAddress` のみを持つ request を渡す。
- 期待結果:
  1. `x-forwarded-for` の先頭 IP を返す。
  2. `::ffff:` プレフィックスを除去した IP を返す。

### BLA-UT-003 必須入力

- 実施手順:
  1. password が空白のみの request で handler を実行する。
- 期待結果:
  1. HTTP 400 を返す。
  2. エラーメッセージは `メールアドレスとパスワードを入力してください。`。

### BLA-UT-004 既存ロック

- 実施手順:
  1. `getLoginAttemptState` が未来の `locked_until` を返す状態で handler を実行する。
- 期待結果:
  1. HTTP 429 を返す。
  2. `retryAfterSeconds` と `lockedUntil` を返す。

### BLA-UT-005 認証失敗

- 実施手順:
  1. `signInWithPassword` が認証エラーを返す状態で handler を実行する。
- 期待結果:
  1. HTTP 401 を返す。
  2. `recordLoginFailure` が呼ばれる。
  3. email と password は trim 済み値で扱われる。

### BLA-UT-006 ロック到達

- 実施手順:
  1. `recordLoginFailure` が未来の `locked_until` を返す状態で handler を実行する。
- 期待結果:
  1. HTTP 429 を返す。
  2. `retryAfterSeconds` と `lockedUntil` を返す。

### BLA-UT-007 認証成功

- 実施手順:
  1. `signInWithPassword` が session と user を返す状態で handler を実行する。
- 期待結果:
  1. HTTP 200 を返す。
  2. session payload を返す。
  3. `resetLoginAttempts` が呼ばれる。

### BLA-UT-008 例外処理

- 実施手順:
  1. `signInWithPassword` が例外を送出する状態で handler を実行する。
- 期待結果:
  1. HTTP 500 を返す。
  2. エラーメッセージは `ログイン処理中にエラーが発生しました。`。
  3. `logError` が呼ばれる。
