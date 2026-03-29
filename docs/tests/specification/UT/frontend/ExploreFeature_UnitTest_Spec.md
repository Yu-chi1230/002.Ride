# Explore機能 単体テスト仕様書（MapLibre移行）

## 1. 目的

`Explore` 機能の MapLibre 移行後について、既存の Explore 単体テスト観点のうち、地図ライブラリ差し替えにより影響を受ける確認項目を明確化する。
対象は `ExplorePage` と `ExploreGuidePage` の主要挙動のうち、MapLibre モック前提で継続確認すべき観点とする。

## 2. テスト対象範囲

本仕様書で扱う範囲:
- `ExplorePage` の初期表示
- ルート探索 API 呼び出し
- 探索失敗時の状態復帰
- `ExploreGuidePage` の詳細取得成功時の HUD 表示
- `ExploreGuidePage` の詳細取得失敗時のエラー表示
- アンマウント時の geolocation 監視解除
- MapLibre モック下での表示・状態遷移確認

本仕様書で扱わない範囲:
- MapLibre 実描画品質
- タイル取得可否
- バックエンド `/api/explore/*` のアルゴリズム品質
- geolocation の実機精度や端末差異
- E2E レベルの遷移通し検証

## 3. 前提条件

- テストフレームワークは `Vitest` + `@testing-library/react` + `@testing-library/user-event` を想定する
- `ExplorePage` と `ExploreGuidePage` は `MemoryRouter` 配下でレンダリングする
- `maplibre-gl` はモック化し、地図実描画依存を排除する
- `navigator.geolocation` は成功/失敗/監視解除を切り替えられるようにモック化する
- `apiFetch` は `/api/explore/routes` と `/api/explore/routes/:id` を切り替えられるようモック化する

## 4. モック方針

### 4.1 API モック

対象:
- `apiFetch('/api/explore/routes', ...)`
- `apiFetch('/api/explore/routes/:id', ...)`

基本方針:
- 正常系は `ok: true` と `json()` で `data` を返す
- 異常系は `ok: false` を返すケースと `throw` するケースを分ける

### 4.2 geolocation モック

対象:
- `navigator.geolocation.getCurrentPosition`
- `navigator.geolocation.watchPosition`
- `navigator.geolocation.clearWatch`

基本方針:
- 初期位置取得成功時に探索 UI が利用可能になることを確認する
- Guide 画面では `watchPosition` と `clearWatch` の呼び出しを確認する

### 4.3 MapLibre モック

対象:
- `maplibre-gl`

基本方針:
- 地図描画はプレースホルダー化し、DOM と状態遷移の確認に集中する
- 地図ライブラリ固有の副作用ではなく、Explore 画面の責務にある API 呼び出し、表示、クリーンアップを確認する

## 5. テスト観点一覧

| ID | 観点 | 区分 | 概要 |
| --- | --- | --- | --- |
| EXM-UT-001 | 初期表示 | 正常系 | `ExplorePage` 初期表示で探索 UI が表示される |
| EXM-UT-002 | ルート探索API正常系 | 正常系 | 探索開始時に API が適切な payload で呼ばれる |
| EXM-UT-003 | 探索失敗時の状態復帰 | 異常系 | API 失敗後にローディング解除され再操作可能になる |
| EXM-UT-004 | Guide詳細取得成功 | 正常系 | `ExploreGuidePage` で詳細取得後に HUD が表示される |
| EXM-UT-005 | Guide詳細取得失敗 | 異常系 | エラー表示と戻る導線が表示される |
| EXM-UT-006 | Guideクリーンアップ | 回帰防止 | アンマウント時に `clearWatch(watchId)` が呼ばれる |

## 6. 詳細テストケース

### EXM-UT-001 初期表示 正常系

- テスト観点: `ExplorePage` の探索 UI 表示
- 実施手順:
  1. `maplibre-gl` をモックした状態で `ExplorePage` をレンダリングする
- 期待結果:
  1. `探索を開始する` が表示される
  2. 地図描画エラーで画面全体が崩れない

### EXM-UT-002 ルート探索API正常系 正常系

- テスト観点: 探索開始時の API 呼び出し
- 実施手順:
  1. geolocation 成功モックを設定する
  2. `apiFetch('/api/explore/routes', ...)` を成功応答にする
  3. `探索を開始する` を押下する
- 期待結果:
  1. `/api/explore/routes` が 1 回呼ばれる
  2. payload に `time_limit_minutes`、`latitude`、`longitude` が含まれる

### EXM-UT-003 探索失敗時の状態復帰 異常系

- テスト観点: API 失敗時の再操作可否
- 実施手順:
  1. `/api/explore/routes` を `ok: false` または `throw` で失敗させる
  2. `探索を開始する` を押下する
- 期待結果:
  1. 処理中はローディング表示になる
  2. 処理後はローディング解除される
  3. 再度操作可能になる

### EXM-UT-004 Guide詳細取得成功 正常系

- テスト観点: `ExploreGuidePage` の詳細取得成功
- 実施手順:
  1. `/api/explore/routes/:id` を成功応答にする
  2. `ExploreGuidePage` をレンダリングする
- 期待結果:
  1. HUD にスポット情報やルート情報が表示される
  2. ガイド画面が MapLibre モック下でも正常表示される

### EXM-UT-005 Guide詳細取得失敗 異常系

- テスト観点: `ExploreGuidePage` のエラー表示
- 実施手順:
  1. `/api/explore/routes/:id` を `ok: false` または `throw` で失敗させる
  2. `ExploreGuidePage` をレンダリングする
- 期待結果:
  1. `ルート情報の取得に失敗しました。` が表示される
  2. 戻る導線が表示される

### EXM-UT-006 Guideクリーンアップ 回帰防止

- テスト観点: geolocation 監視解除
- 実施手順:
  1. `watchPosition` が `watchId` を返す状態で `ExploreGuidePage` をレンダリングする
  2. コンポーネントをアンマウントする
- 期待結果:
  1. `clearWatch(watchId)` が呼ばれる
