# Create機能 Backend 単体テスト仕様書

## 1. 目的

`create` 機能の backend のうち、`/api/create/generate` の handler ロジックについて、単体テストで確認する対象と未確認範囲を明確化する。
対象は認可、入力検証、テーマ検証、強度変換、画像変換結果整形、作成成功、例外時応答とする。

## 2. テスト対象範囲

本仕様書で扱う範囲:
- `backend/src/create/generateHandler.ts`
- `/api/create/generate` の handler ロジック
- テーマ必須・画像必須チェック
- テーマサポート可否判定
- `intensity` の変換と範囲検証
- 加工画像レスポンス整形
- 作成成功時の 200 応答
- 例外時の 500 応答

本仕様書で扱わない範囲:
- `applyThemeToImage` の画像加工品質
- Prisma 実 DB 接続を伴う creation/cinematic_details 保存妥当性
- `upload.array('images', 10)` middleware 自体の検証
- `requireAuth` middleware 自体の検証

## 3. 前提条件

- backend コンテナ `002ride-backend-1` が起動していること
- `test:unit` は `node --test -r ts-node/register src/test/*.spec.ts` で実行されること
- handler は依存注入で画像変換、テーマ判定、保存処理を差し替えられること

## 4. モック方針

対象:
- `isCreateThemeId(theme)`
- `applyThemeToImage(buffer, theme, intensity)`
- `getCreateThemePreset(theme)`
- `createCreation({ userId, colorLogicMemo })`
- `req.user`
- `req.body.theme`
- `req.body.intensity`
- `req.files`
- `res.status().json()`
- `logError`

基本方針:
- テーマ判定は true/false を切り替える
- 画像変換は固定 Buffer を返す、または例外を投げる
- 作成処理は `creation.id` を返す
- `res` は `statusCode` と `body` を記録する軽量モックを使う

## 5. テスト観点一覧

| ID | 観点 | 区分 | 概要 |
| --- | --- | --- | --- |
| CRB-UT-001 | 認可 | 異常系 | `req.user` がない場合に 401 を返す |
| CRB-UT-002 | 必須入力 | 異常系 | テーマ未指定または画像0件で 400 を返す |
| CRB-UT-003 | テーマ検証 | 異常系 | 未対応テーマに 400 を返す |
| CRB-UT-004 | 強度検証 | 異常系 | 範囲外の `intensity` に 400 を返す |
| CRB-UT-005 | 強度変換 | 正常系 | `normal` と `strong` を規定値へ変換する |
| CRB-UT-006 | 強度配線 | 正常系 | `intensity` 未指定時に 50 が handler 経由で画像変換へ渡る |
| CRB-UT-007 | 強度配線 | 正常系 | `intensity='normal'` 時に 50 が handler 経由で画像変換へ渡る |
| CRB-UT-008 | 生成成功 | 正常系 | 加工画像と creation 情報を返し 200 を返す |
| CRB-UT-009 | 生成失敗 | 異常系 | 画像変換や保存処理例外に 500 を返しログ出力する |

## 6. 詳細テストケース

### CRB-UT-001 認可 異常系

- テスト観点: 未認証リクエストの遮断
- 実施手順:
  1. `req.user` なしで handler を実行する
- 期待結果:
  1. 401 を返す
  2. body に `Unauthorized` を返す

### CRB-UT-002 必須入力 異常系

- テスト観点: テーマと画像の必須チェック
- 実施手順:
  1. `theme` 未指定、または `files=[]` で handler を実行する
- 期待結果:
  1. 400 を返す
  2. body に `Theme and at least one image are required` を返す

### CRB-UT-003 テーマ検証 異常系

- テスト観点: 未対応テーマの拒否
- 実施手順:
  1. `isCreateThemeId` が `false` を返すようにする
  2. 画像1件以上で handler を実行する
- 期待結果:
  1. 400 を返す
  2. body に `Unsupported theme` を返す

### CRB-UT-004 強度検証 異常系

- テスト観点: `intensity` 範囲外入力の拒否
- 実施手順:
  1. `intensity='101'` で handler を実行する
- 期待結果:
  1. 400 を返す
  2. body に `Intensity must be between 0 and 100` を返す

### CRB-UT-005 強度変換 正常系

- テスト観点: 強度プリセット変換
- 実施手順:
  1. `normalizeCreateIntensity` に `undefined`、`normal`、`strong`、数値文字列を渡す
- 期待結果:
  1. `undefined` は 50
  2. `normal` は 50
  3. `strong` は 100
  4. 数値文字列は `Number(...)` 相当で変換される

### CRB-UT-006 強度配線 正常系

- テスト観点: `intensity` 未指定時の handler 配線
- 実施手順:
  1. `intensity` を未指定にした request で handler を実行する
  2. `applyThemeToImage` の呼び出し引数を確認する
- 期待結果:
  1. `applyThemeToImage` に `intensity=50` が渡る
  2. デフォルト値が helper 単体ではなく handler 経由でも反映される

### CRB-UT-007 強度配線 正常系

- テスト観点: `intensity='normal'` 指定時の handler 配線
- 実施手順:
  1. `intensity='normal'` を指定した request で handler を実行する
  2. `applyThemeToImage` の呼び出し引数を確認する
- 期待結果:
  1. `applyThemeToImage` に `intensity=50` が渡る
  2. helper 変換結果が handler の保存・加工フローに正しく接続される

### CRB-UT-008 生成成功 正常系

- テスト観点: 画像加工結果と作成結果のレスポンス整形
- 実施手順:
  1. `applyThemeToImage` が固定 Buffer を返すようにする
  2. `getCreateThemePreset` が固定 memo を返すようにする
  3. `createCreation` が `creation.id` を返すようにする
  4. `theme='cyberpunk'`、`intensity='strong'`、画像2件で handler を実行する
- 期待結果:
  1. `applyThemeToImage` が各画像に対して呼ばれる
  2. 200 を返す
  3. body に `creation_id`、`theme`、`intensity`、`color_logic_memo`、`processed_images` を返す

### CRB-UT-009 生成失敗 異常系

- テスト観点: 加工または保存例外時の応答
- 実施手順:
  1. `applyThemeToImage` または `createCreation` が例外を投げるようにする
  2. `logError` をモックして handler を実行する
- 期待結果:
  1. 500 を返す
  2. body に `Internal Server Error during image styling` を返す
  3. `logError` が 1 回呼ばれる
