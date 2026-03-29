# Setting機能 Backend 単体テスト仕様書

## 1. 目的

`setting` 機能の backend に含まれるオイル管理ロジックについて、単体テストで確認する対象と未確認範囲を明確化する。
対象は `backend/src/settings/maintenance.ts` に切り出した pure logic とし、API 全体の transaction や DB 実接続を伴う確認は本仕様書の対象外とする。

## 2. 対象実装

- `backend/src/settings/maintenance.ts`
  - `buildVehicleWithMaintenanceStatus`
  - `hasOilChangeStateChanged`
  - `syncManualOilChangeHistory`
- `backend/package.json`
  - `test:unit`

## 3. 対象範囲

本仕様書で扱う範囲:
- オイル管理設定からメンテナンス状態を算出する処理
- 前回オイル交換情報の差分判定処理
- 手動オイル交換履歴の削除と再作成処理
- backend の unit test 実行対象が `*.spec.ts` に限定されること

本仕様書で扱わない範囲:
- `/api/users/me` エンドポイント全体の transaction 挙動
- Prisma 実 DB 接続を伴う結合確認
- `parsedOilChangeIntervalKm` の更新分岐
- `maintenance_settings更新` 履歴生成
- `deleteMany` や `create` が例外を返した場合の API ハンドリング
- Gemini など外部 API の疎通確認

## 4. 前提条件

- backend コンテナ `002ride-backend-1` が起動していること
- テスト実行場所はコンテナ内 `/app` であること
- 単体テストは `node:test` と `ts-node/register` を用いること
- 対象ロジックはモック可能な依存だけを受け取る pure logic として切り出されていること

## 5. 実施手順

1. backend コンテナで `/app` に移動する
2. `npm run test:unit` を実行する
3. 必要に応じて `npm run build` を実行し、型エラーがないことを確認する
4. 実行ログから `src/test/*.spec.ts` に一致する unit test のみが実行されていることを確認する
5. `test_gemini.ts` が unit test 実行対象に含まれていないことを確認する

## 6. テスト観点一覧

| ID | 観点 | 区分 | 概要 |
| --- | --- | --- | --- |
| STB-UT-001 | メンテナンス状態算出 | 正常系 | 残距離が正数の場合に `remaining_km` と `is_overdue=false` を返す |
| STB-UT-002 | メンテナンス状態算出 | 境界値 | 残距離が 0 以下の場合に `is_overdue=true` を返す |
| STB-UT-003 | メンテナンス状態算出 | 欠損系 | オイル設定が存在しない場合に `oil_maintenance_status=null` を返す |
| STB-UT-004 | メンテナンス状態算出 | 欠損系 | 走行距離情報が `null` の場合に残距離を `null` とする |
| STB-UT-005 | 差分判定 | 正常系 | 同日内の時刻差だけでは差分なしと判定する |
| STB-UT-006 | 差分判定 | 正常系 | 走行距離が変わった場合は差分ありと判定する |
| STB-UT-007 | 差分判定 | 欠損系 | `null` 同士は差分なし、片側のみ `null` は差分ありと判定する |
| STB-UT-008 | 手動履歴再同期 | 正常系 | 既存の手動履歴を削除し、走行距離ありなら再作成する |
| STB-UT-009 | 手動履歴再同期 | 欠損系 | 走行距離なしなら削除のみ行い、再作成しない |
| STB-UT-010 | 単体テスト実行対象 | 回帰防止 | `test:unit` が `*.spec.ts` のみを対象とし、ad-hoc スクリプトを拾わない |

## 7. 詳細テストケース

### STB-UT-001 メンテナンス状態算出 正常系

- テスト観点: オイル交換後の走行距離が交換サイクル未満の場合の残距離算出
- 再現条件:
  - `interval_km=5000`
  - `current_mileage=15000`
  - `last_oil_change_mileage=12000`
- 実施手順:
  1. `maintenance_settings.findFirst` が `item_name='oil', interval_km=5000` を返すようにモックする
  2. `buildVehicleWithMaintenanceStatus` を実行する
- 期待結果:
  1. `distance_since_last_change=3000` を返す
  2. `remaining_km=2000` を返す
  3. `is_overdue=false` を返す

### STB-UT-002 メンテナンス状態算出 境界値

- テスト観点: 交換推奨距離を超過した場合の期限超過判定
- 再現条件:
  - `interval_km=3000`
  - `current_mileage=15200`
  - `last_oil_change_mileage=12000`
- 実施手順:
  1. `maintenance_settings.findFirst` が `item_name='engine_oil', interval_km=3000` を返すようにモックする
  2. `buildVehicleWithMaintenanceStatus` を実行する
- 期待結果:
  1. `distance_since_last_change=3200` を返す
  2. `remaining_km=-200` を返す
  3. `is_overdue=true` を返す

### STB-UT-003 メンテナンス状態算出 欠損系

- テスト観点: オイル設定未登録時の戻り値
- 再現条件:
  - `maintenance_settings.findFirst` が `null` を返す
- 実施手順:
  1. オイル設定が見つからないモックで `buildVehicleWithMaintenanceStatus` を実行する
- 期待結果:
  1. `oil_maintenance_status=null` を返す

### STB-UT-004 メンテナンス状態算出 欠損系

- テスト観点: 走行距離情報不足時の残距離算出
- 再現条件:
  - `interval_km=5000`
  - `current_mileage=null`
  - `last_oil_change_mileage=12000`
- 実施手順:
  1. `maintenance_settings.findFirst` が `item_name='oil', interval_km=5000` を返すようにモックする
  2. `buildVehicleWithMaintenanceStatus` を実行する
- 期待結果:
  1. `distance_since_last_change=null` を返す
  2. `remaining_km=null` を返す
  3. `is_overdue=false` を返す

### STB-UT-005 差分判定 正常系

- テスト観点: 日付粒度の差分判定
- 再現条件:
  - 前回値と次回値で `last_oil_change_mileage` は同じ
  - 日付は同日で時刻だけ異なる
- 実施手順:
  1. `hasOilChangeStateChanged` に同日異時刻の `Date` を渡す
- 期待結果:
  1. `false` を返す

### STB-UT-006 差分判定 正常系

- テスト観点: 走行距離変更時の差分判定
- 再現条件:
  - 前回値 `last_oil_change_mileage=1000`
  - 次回値 `last_oil_change_mileage=1200`
- 実施手順:
  1. `hasOilChangeStateChanged` に走行距離だけ変更した値を渡す
- 期待結果:
  1. `true` を返す

### STB-UT-007 差分判定 欠損系

- テスト観点: `null` を含む差分判定
- 再現条件:
  - ケース1: 前回値と次回値の走行距離と日付がともに `null`
  - ケース2: 走行距離または日付の片側のみ `null`
- 実施手順:
  1. `hasOilChangeStateChanged` に `null` 同士の値を渡す
  2. `hasOilChangeStateChanged` に片側のみ `null` の値を渡す
- 期待結果:
  1. `null` 同士は `false` を返す
  2. 片側のみ `null` の場合は `true` を返す

### STB-UT-008 手動履歴再同期 正常系

- テスト観点: 手動履歴の削除と再作成
- 再現条件:
  - `last_oil_change_mileage=12345`
  - `last_oil_change_date=2026-03-20`
- 実施手順:
  1. `maintenance_history.deleteMany` と `create` をモックする
  2. `syncManualOilChangeHistory` を実行する
- 期待結果:
  1. `deleteMany` が 1 回呼ばれる
  2. `create` が 1 回呼ばれる
  3. `notes` に `source=manual_oil_change_registration` と日付と走行距離が含まれる

### STB-UT-009 手動履歴再同期 欠損系

- テスト観点: 走行距離未入力時の再作成抑止
- 再現条件:
  - `last_oil_change_mileage=null`
- 実施手順:
  1. `maintenance_history.deleteMany` と `create` をモックする
  2. `syncManualOilChangeHistory` を実行する
- 期待結果:
  1. `deleteMany` が 1 回呼ばれる
  2. `create` は呼ばれない

### STB-UT-010 単体テスト実行対象 回帰防止

- テスト観点: unit test 実行対象の妥当性
- 再現条件:
  - `backend/src/test` に `*.spec.ts` と ad-hoc 実行スクリプトが混在している
- 実施手順:
  1. `npm run test:unit` を実行する
  2. 実行ログの対象が `src/test/*.spec.ts` に一致する unit test のみであることを確認する
- 期待結果:
  1. `*.spec.ts` に一致する unit test のみが実行される
  2. `test_gemini.ts` は実行されない

## 8. 未確認事項と残リスク

- `syncManualOilChangeHistory` 実行時に `deleteMany` または `create` が例外を返した場合の挙動は未確認
- API レイヤーでのバリデーションや transaction の整合性は別レイヤーの確認が必要
