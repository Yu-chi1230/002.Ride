# Health機能 Backend 単体テスト仕様書

## 1. 目的

`health` 機能の backend のうち、`/api/health/mileage` の handler ロジックについて、単体テストで確認する対象と未確認範囲を明確化する。
対象は認可、入力検証、車両存在確認、前回オイル交換距離との整合、更新成功、例外時応答とする。

## 2. テスト対象範囲

本仕様書で扱う範囲:
- `backend/src/health/mileageHandler.ts`
- `/api/health/mileage` の handler ロジック
- `mileage` の必須チェックと数値バリデーション
- 車両未登録時の応答
- 前回オイル交換距離との比較
- 更新成功時のレスポンス
- 更新例外時の 500 応答

本仕様書で扱わない範囲:
- Prisma 実 DB 接続を伴う transaction 妥当性
- `buildVehicleWithMaintenanceStatus` の内部計算品質
- `/api/health/analyze` と `/api/health/analyze-audio` の AI 解析品質
- `requireAuth` middleware 自体の検証

## 3. 前提条件

- backend コンテナ `002ride-backend-1` が起動していること
- `test:unit` は `node --test -r ts-node/register src/test/*.spec.ts` で実行されること
- handler は依存注入で `findVehicleByUserId`、`updateMileage`、`buildVehicleWithMaintenanceStatus` を差し替えられること

## 4. モック方針

対象:
- `findVehicleByUserId(userId)`
- `updateMileage(vehicle, normalizedMileage)`
- `buildVehicleWithMaintenanceStatus(vehicle)`
- `req.user`
- `req.body.mileage`
- `res.status().json()`
- `logError`

基本方針:
- 車両検索は `vehicle` を返す、`null` を返す、成功後処理に進むケースを分ける
- `updateMileage` は成功と `throw` を分ける
- `buildVehicleWithMaintenanceStatus` は整形済み vehicle を返す
- `res` は `statusCode` と `body` を記録する軽量モックを使う

## 5. テスト観点一覧

| ID | 観点 | 区分 | 概要 |
| --- | --- | --- | --- |
| HLB-UT-001 | 認可 | 異常系 | `req.user` がない場合に 401 を返す |
| HLB-UT-002 | 必須入力 | 異常系 | `mileage` 未入力時に 400 を返す |
| HLB-UT-003 | 数値検証 | 異常系 | 負数や不正値の `mileage` に 400 を返す |
| HLB-UT-004 | 車両存在確認 | 異常系 | 対象車両が見つからない場合に 404 を返す |
| HLB-UT-005 | オイル交換距離整合 | 異常系 | 前回オイル交換距離未満の入力に 400 を返す |
| HLB-UT-006 | 更新成功 | 正常系 | `mileage` を整数化して更新し 200 を返す |
| HLB-UT-007 | 更新失敗 | 異常系 | 更新処理例外時に 500 を返しログ出力する |

## 6. 詳細テストケース

### HLB-UT-001 認可 異常系

- テスト観点: 未認証リクエストの遮断
- 実施手順:
  1. `req.user` なしで handler を実行する
- 期待結果:
  1. 401 を返す
  2. body に `Unauthorized` を返す

### HLB-UT-002 必須入力 異常系

- テスト観点: `mileage` 必須チェック
- 実施手順:
  1. `req.user` あり、`mileage=''` で handler を実行する
- 期待結果:
  1. 400 を返す
  2. body に `mileage is required` を返す

### HLB-UT-003 数値検証 異常系

- テスト観点: `mileage` 数値バリデーション
- 実施手順:
  1. `req.user` あり、`mileage=-1` で handler を実行する
- 期待結果:
  1. 400 を返す
  2. body に `Invalid mileage` を返す

### HLB-UT-004 車両存在確認 異常系

- テスト観点: 車両未登録時の応答
- 実施手順:
  1. `findVehicleByUserId` が `null` を返すようにする
  2. `req.user.id='user-1'` で handler を実行する
- 期待結果:
  1. 404 を返す
  2. body に `Vehicle not found` を返す

### HLB-UT-005 オイル交換距離整合 異常系

- テスト観点: 前回オイル交換距離より小さい入力の拒否
- 実施手順:
  1. `last_oil_change_mileage=5000` の車両を返すようにする
  2. `mileage=4500` で handler を実行する
- 期待結果:
  1. 400 を返す
  2. body に前回オイル交換距離を含むエラーメッセージを返す

### HLB-UT-006 更新成功 正常系

- テスト観点: 走行距離更新の正常完了
- 実施手順:
  1. `mileage=1234.9` を渡す
  2. `updateMileage` が成功するようにする
  3. `buildVehicleWithMaintenanceStatus` が整形済み vehicle を返すようにする
- 期待結果:
  1. `updateMileage` が `normalizedMileage=1234` で呼ばれる
  2. 200 を返す
  3. body に `message`、`data.vehicle`、`data.log`、`data.mileage` を返す

### HLB-UT-007 更新失敗 異常系

- テスト観点: 更新処理例外時の応答
- 実施手順:
  1. `updateMileage` が例外を投げるようにする
  2. `logError` をモックして handler を実行する
- 期待結果:
  1. 500 を返す
  2. body に `Internal Server Error during mileage update` を返す
  3. `logError` が 1 回呼ばれる
