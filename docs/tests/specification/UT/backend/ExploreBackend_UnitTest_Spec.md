# Explore機能 Backend 単体テスト仕様書

## 1. 目的

`explore` 機能の backend のうち、`/api/explore/routes/:id` の詳細取得 handler ロジックについて、単体テストで確認する対象と未確認範囲を明確化する。
対象は認可、ルート存在確認、所有者チェック、詳細取得成功、例外時応答とする。

## 2. テスト対象範囲

本仕様書で扱う範囲:
- `backend/src/explore/routeDetailsHandler.ts`
- `/api/explore/routes/:id` の handler ロジック
- ルート未存在時の 404 応答
- 所有者不一致時の 403 応答
- waypoints、route_geometry、cinematic_spots を含む成功応答
- 例外時の 500 応答

本仕様書で扱わない範囲:
- Prisma 実 DB 接続を伴う `findUnique` / `findMany` の妥当性
- `getRouteGeometryFromWaypoints` の内部アルゴリズム品質
- `/api/explore/routes` のルート生成ロジック
- `requireAuth` middleware 自体の検証

## 3. 前提条件

- backend コンテナ `002ride-backend-1` が起動していること
- `test:unit` は `node --test -r ts-node/register src/test/*.spec.ts` で実行されること
- handler は依存注入で route、waypoints、geometry、spots の取得処理を差し替えられること

## 4. モック方針

対象:
- `findRouteById(routeId)`
- `findWaypointsByRouteId(routeId)`
- `getRouteGeometryFromWaypoints(waypoints)`
- `findCinematicSpotsByRouteId(routeId)`
- `req.user`
- `req.params.id`
- `res.status().json()`
- `logError`

基本方針:
- route 取得は `route` を返す、`null` を返す、`throw` するパターンを用意する
- waypoints、geometry、spots は成功系で固定データを返す
- `req.user` は あり/なしを切り替える
- `res` は `statusCode` と `body` を記録する軽量モックを使う

## 5. テスト観点一覧

| ID | 観点 | 区分 | 概要 |
| --- | --- | --- | --- |
| EXB-UT-001 | 認可 | 異常系 | `req.user` がない場合に 401 を返す |
| EXB-UT-002 | ルート存在確認 | 異常系 | ルート未存在時に 404 を返す |
| EXB-UT-003 | 所有者チェック | 異常系 | ルート所有者が一致しない場合に 403 を返す |
| EXB-UT-004 | 詳細取得成功 | 正常系 | ルート詳細一式を返し 200 を返す |
| EXB-UT-005 | 取得失敗 | 異常系 | 詳細取得中の例外に 500 を返しログ出力する |

## 6. 詳細テストケース

### EXB-UT-001 認可 異常系

- テスト観点: 未認証リクエストの遮断
- 実施手順:
  1. `req.user` なしで handler を実行する
- 期待結果:
  1. 401 を返す
  2. body に `Unauthorized` を返す

### EXB-UT-002 ルート存在確認 異常系

- テスト観点: ルート未存在時の応答
- 実施手順:
  1. `findRouteById` が `null` を返すようにする
  2. `req.user.id='user-1'`、`req.params.id='route-1'` で handler を実行する
- 期待結果:
  1. `findRouteById('route-1')` が呼ばれる
  2. 404 を返す
  3. body に `Route not found` を返す

### EXB-UT-003 所有者チェック 異常系

- テスト観点: 他ユーザーのルート参照拒否
- 実施手順:
  1. `findRouteById` が `user_id='other-user'` の route を返すようにする
  2. `req.user.id='user-1'` で handler を実行する
- 期待結果:
  1. 403 を返す
  2. body に `Forbidden: You do not own this route` を返す

### EXB-UT-004 詳細取得成功 正常系

- テスト観点: ルート詳細の正常取得
- 実施手順:
  1. `findRouteById` が自分の route を返すようにする
  2. `findWaypointsByRouteId`、`getRouteGeometryFromWaypoints`、`findCinematicSpotsByRouteId` が成功するようにする
  3. handler を実行する
- 期待結果:
  1. 200 を返す
  2. body に `route`、`route_geometry`、`waypoints`、`cinematic_spots` を返す

### EXB-UT-005 取得失敗 異常系

- テスト観点: 詳細取得例外時の応答
- 実施手順:
  1. `findRouteById` が例外を投げるようにする
  2. `logError` をモックして handler を実行する
- 期待結果:
  1. 500 を返す
  2. body に `Internal Server Error fetching route details` を返す
  3. `logError` が 1 回呼ばれる
