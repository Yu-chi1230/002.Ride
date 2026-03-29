# Home機能 Backend 単体テスト仕様書

## 1. 目的

Home 画面が依存する backend API `/api/explore/routes/latest` について、単体テストで確認する対象と未確認範囲を明確化する。
対象は handler の認可、最新ルート取得、未存在時の応答、例外時の応答とする。

## 2. テスト対象範囲

本仕様書で扱う範囲:
- `backend/src/explore/latestRouteHandler.ts`
- `/api/explore/routes/latest` の handler ロジック
- 認証ユーザー有無による分岐
- 最新ルート取得成功時、未取得時、例外時のレスポンス

本仕様書で扱わない範囲:
- Prisma 実 DB 接続を伴うクエリ妥当性
- `routes` テーブルの並び順が DB 上で期待通りになるかの結合確認
- frontend `HomePage` 側の表示品質
- `requireAuth` middleware 自体の検証

## 3. 前提条件

- backend コンテナ `002ride-backend-1` が起動していること
- `test:unit` は `node --test -r ts-node/register src/test/*.spec.ts` で実行されること
- handler は依存注入で `findLatestRoute` を差し替えられること

## 4. モック方針

対象:
- `findLatestRoute(userId)`
- `req.user`
- `res.status().json()`
- `logError`

基本方針:
- `findLatestRoute` は `route` を返す、`null` を返す、`throw` するパターンを用意する
- `req.user` は あり/なしを切り替える
- `res` は `statusCode` と `body` を記録する軽量モックを使う
- `logError` は 500 系で呼び出し内容を確認する

## 5. テスト観点一覧

| ID | 観点 | 区分 | 概要 |
| --- | --- | --- | --- |
| HBH-UT-001 | 認可 | 異常系 | `req.user` がない場合に 401 を返す |
| HBH-UT-002 | 最新ルート未存在 | 異常系 | `findLatestRoute` が `null` の場合に 404 を返す |
| HBH-UT-003 | 最新ルート取得成功 | 正常系 | 最新ルートを返し 200 を返す |
| HBH-UT-004 | 取得失敗 | 異常系 | `findLatestRoute` が例外を投げた場合に 500 を返しログ出力する |

## 6. 詳細テストケース

### HBH-UT-001 認可 異常系

- テスト観点: 未認証リクエストの遮断
- 実施手順:
  1. `req.user` なしで handler を実行する
- 期待結果:
  1. 401 を返す
  2. body に `Unauthorized` を返す

### HBH-UT-002 最新ルート未存在 異常系

- テスト観点: 最新ルートが存在しない場合の応答
- 実施手順:
  1. `findLatestRoute` が `null` を返すようにする
  2. `req.user.id='user-1'` で handler を実行する
- 期待結果:
  1. `findLatestRoute('user-1')` が呼ばれる
  2. 404 を返す
  3. body に `No routes found` を返す

### HBH-UT-003 最新ルート取得成功 正常系

- テスト観点: 最新ルートの正常取得
- 実施手順:
  1. `findLatestRoute` が route オブジェクトを返すようにする
  2. `req.user.id='user-1'` で handler を実行する
- 期待結果:
  1. 200 を返す
  2. body に `message` と `data.route` を返す

### HBH-UT-004 取得失敗 異常系

- テスト観点: DB 取得例外時の応答
- 実施手順:
  1. `findLatestRoute` が例外を投げるようにする
  2. `logError` をモックして handler を実行する
- 期待結果:
  1. 500 を返す
  2. body に `Internal Server Error fetching latest route` を返す
  3. `logError` が 1 回呼ばれる
