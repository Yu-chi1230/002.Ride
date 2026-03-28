# Explore機能 単体テスト仕様書

## 1. 目的

`Explore` 機能の主要コンポーネント (`ExplorePage`, `ExploreGuidePage`) の単体テスト観点を整理し、
位置情報取得、ルート探索、結果表示、ガイド表示の基本挙動を安定して検証できる状態にする。

対象実装:
- `frontend/pages/ExplorePage.tsx`
- `frontend/pages/ExploreGuidePage.tsx`

関連境界:
- `apiFetch`
- `navigator.geolocation.getCurrentPosition`
- `navigator.geolocation.watchPosition`
- `navigator.geolocation.clearWatch`
- `react-router-dom` (`useNavigate`, `useLocation`, `useParams`)
- `react-leaflet` (`MapContainer` などはモック化を前提)

## 2. テスト対象範囲

本仕様書で扱う範囲:
- `ExplorePage` の初期表示と位置情報取得
- 探索条件（時間変更、プリセット選択）
- ルート探索 API 呼び出し
- 探索結果表示（0件/複数件/スポット表示）
- 事前定義ルート受け取り (`location.state.predefinedRoute`)
- `ExploreGuidePage` のルート詳細取得
- ガイド画面の位置情報追従開始/停止と速度表示
- エラー時のフォールバック表示と戻る導線

本仕様書で扱わない範囲:
- 実地図描画品質、Leaflet の内部挙動
- OpenStreetMap タイル取得可否
- バックエンド `/api/explore/*` のアルゴリズム品質
- GPS 実機精度、ブラウザ/端末差異
- E2E レベルの遷移通し検証

## 3. 前提条件

- テストフレームワークは `Vitest` + `@testing-library/react` + `@testing-library/user-event` を想定する。
- `react-leaflet` コンポーネントは軽量モック化し、DOM 上の表示検証を中心に行う。
- `apiFetch` はモック化する。
- ルーターは `MemoryRouter` を利用し、必要に応じて `useNavigate` / `useParams` / `useLocation` を制御する。
- `navigator.geolocation` API はテストごとに成功/失敗を切り替えられるようにモック化する。

## 4. モック方針

### 4.1 API モック

対象:
- `apiFetch('/api/explore/routes', ...)`
- `apiFetch('/api/explore/routes/:id', ...)`

基本方針:
- 正常系は `ok: true` + `json()` で `data` を返す。
- 異常系は `ok: false` を返すケースと `throw` するケースを分ける。

### 4.2 位置情報モック

対象:
- `navigator.geolocation.getCurrentPosition`
- `navigator.geolocation.watchPosition`
- `navigator.geolocation.clearWatch`

基本方針:
- `ExplorePage` は `getCurrentPosition` の成功/失敗両方を検証する。
- `ExploreGuidePage` は `watchPosition` で位置更新されることと、アンマウント時の `clearWatch` を検証する。

### 4.3 Leaflet モック

対象:
- `MapContainer`, `TileLayer`, `Polyline`, `Marker`, `Popup`, `Polygon`, `useMap`

基本方針:
- レンダリングはプレースホルダー化し、`positions` など渡された props の検証に集中する。
- `useMap` の `setView` / `flyTo` 呼び出し回数を確認する。

## 5. テスト観点一覧

| ID | 観点 | 概要 |
| --- | --- | --- |
| EX-UT-001 | 初期位置取得成功 | `ExplorePage` 初期表示時に現在地を取得し、探索ボタンを表示する |
| EX-UT-002 | 初期位置取得失敗フォールバック | 位置取得失敗時に熊本市座標を設定し、探索を継続可能にする |
| EX-UT-003 | ルート探索API正常系 | 探索開始時に `time_limit_minutes` / 緯度経度を送信し結果表示へ遷移する |
| EX-UT-004 | ルート0件表示 | API が空配列を返した場合に0件メッセージと再検索導線を表示する |
| EX-UT-005 | 探索失敗時の状態復帰 | API異常時に `isSearching` が解除され再操作可能になる |
| EX-UT-006 | 時間プリセット再探索 | 結果表示中にプリセット変更すると再探索 API が呼ばれる |
| EX-UT-007 | 事前定義ルート表示 | `location.state.predefinedRoute` を受け取った場合におすすめルート表示へ入る |
| EX-UT-008 | ルートカード選択 | 複数候補時にカード選択でアクティブルートが切り替わる |
| EX-UT-009 | ナビ開始導線 | `ナビゲーションを開始` で `/explore/guide/:routeId` へ遷移要求する |
| EX-UT-010 | 条件変更でリセット | `条件を変えて再検索` で結果状態を初期化し探索パネルへ戻る |
| EX-UT-011 | Guide初期ローディング | `ExploreGuidePage` は取得中にローディング表示を出す |
| EX-UT-012 | Guide詳細取得成功 | 取得成功時にルート名/スポット情報を表示する |
| EX-UT-013 | Guide詳細取得失敗 | 取得失敗時にエラー表示と戻る導線を表示する |
| EX-UT-014 | Guide位置追従 | `watchPosition` の更新で速度表示が更新される |
| EX-UT-015 | Guide追従トグル | 追従トグル押下で `isTracking` が反転し `flyTo` 条件が切り替わる |
| EX-UT-016 | Guideクリーンアップ | アンマウント時に `clearWatch` が呼ばれる |

## 6. 詳細テストケース

### EX-UT-001 初期位置取得成功

- テスト観点: 初期位置取得成功時の表示
- 実施手順:
  1. `getCurrentPosition` 成功モックで `ExplorePage` をレンダリングする。
- 期待結果:
  1. 位置情報エラー文言が表示されない。
  2. `探索を開始する` ボタンが表示される。
  3. 所要時間表示が表示される。

### EX-UT-002 初期位置取得失敗フォールバック

- テスト観点: 位置情報失敗時のフォールバック
- 実施手順:
  1. `getCurrentPosition` の error callback を呼ぶ。
  2. `ExplorePage` をレンダリングする。
- 期待結果:
  1. 内部の `userLocation` がフォールバック座標 (32.8032, 130.7079) へ設定される。
  2. 探索ボタンが利用可能である。

### EX-UT-003 ルート探索API正常系

- テスト観点: 探索開始時のAPI呼び出し
- 実施手順:
  1. 現在地を設定した状態で `探索を開始する` を押下する。
  2. `apiFetch` を成功応答で解決する。
- 期待結果:
  1. `apiFetch('/api/explore/routes', ...)` が1回呼ばれる。
  2. リクエスト body に `time_limit_minutes`, `latitude`, `longitude` が含まれる。
  3. 結果パネルに `件のルートが見つかりました` が表示される。

### EX-UT-004 ルート0件表示

- テスト観点: 空結果時のUI
- 実施手順:
  1. 探索APIを `routes: []` で返す。
- 期待結果:
  1. `ルートが見つかりませんでした` メッセージが表示される。
  2. `条件を変えて再検索` ボタンが表示される。

### EX-UT-005 探索失敗時の状態復帰

- テスト観点: API失敗時のローディング解除
- 実施手順:
  1. 探索APIを `ok: false` または `throw` で失敗させる。
  2. 探索ボタンを押下する。
- 期待結果:
  1. 処理中は `探索中...` が表示される。
  2. 処理後に `探索を開始する` 表示へ戻る。
  3. ボタンが再度操作可能になる。

### EX-UT-006 時間プリセット再探索

- テスト観点: 結果表示中のプリセット変更再探索
- 実施手順:
  1. 一度探索成功させて結果を表示する。
  2. 時間プリセット (`00:30` or `05:00`) を押下する。
- 期待結果:
  1. `timeLimit` が選択値に更新される。
  2. 再探索APIが追加で呼ばれる。

### EX-UT-007 事前定義ルート表示

- テスト観点: `predefinedRoute` 受け取り
- 実施手順:
  1. `useLocation().state.predefinedRoute` を渡して `ExplorePage` をレンダリングする。
- 期待結果:
  1. 結果タイトルが `おすすめルート` になる。
  2. `isPredefinedRoute` 扱いで1件結果として表示される。
  3. 先頭 waypoint が現在地として反映される。

### EX-UT-008 ルートカード選択

- テスト観点: 複数ルート時の切替
- 実施手順:
  1. 2件以上の探索結果を表示する。
  2. 2件目カードをクリックする。
- 期待結果:
  1. 2件目カードがアクティブ表示になる。
  2. アクティブルートタイトルが2件目の内容に切り替わる。

### EX-UT-009 ナビ開始導線

- テスト観点: Guide画面への遷移要求
- 実施手順:
  1. 結果表示状態で `ナビゲーションを開始` ボタンを押下する。
- 期待結果:
  1. `navigate('/explore/guide/{routeId}')` が呼ばれる。

### EX-UT-010 条件変更でリセット

- テスト観点: 結果を閉じて再検索へ戻る
- 実施手順:
  1. 結果表示状態で `条件を変えて再検索` を押下する。
- 期待結果:
  1. `routeResults` が `null` になる。
  2. `selectedRouteIndex` が `0` に戻る。
  3. 探索パネルが再表示される。

### EX-UT-011 Guide初期ローディング

- テスト観点: 取得中表示
- 実施手順:
  1. `ExploreGuidePage` で API を未解決 Promise にする。
- 期待結果:
  1. `INITIALIZING NAVIGATION...` が表示される。

### EX-UT-012 Guide詳細取得成功

- テスト観点: 詳細取得成功時の描画
- 実施手順:
  1. `/api/explore/routes/:id` を成功応答で返す。
- 期待結果:
  1. ルート情報に基づく HUD（スポット名など）が表示される。
  2. 終了ボタン (`✕`) が表示される。

### EX-UT-013 Guide詳細取得失敗

- テスト観点: 詳細取得失敗時のフォールバック
- 実施手順:
  1. `/api/explore/routes/:id` を `ok: false` または `throw` で失敗させる。
- 期待結果:
  1. `ルート情報の取得に失敗しました。` が表示される。
  2. `戻る` ボタン押下で `/explore` への遷移要求が行われる。

### EX-UT-014 Guide位置追従

- テスト観点: 位置更新と速度表示
- 実施手順:
  1. `watchPosition` 成功コールバックで `speed` を持つ位置更新を流す。
- 期待結果:
  1. 速度表示が `Math.round(speed * 3.6)` に更新される。

### EX-UT-015 Guide追従トグル

- テスト観点: 自動追従のON/OFF切替
- 実施手順:
  1. 追従トグルボタン (`📍`) を押下する。
  2. 再度押下する。
- 期待結果:
  1. `isTracking` が true/false で反転する。
  2. `TrackUserLocation` の `flyTo` 呼び出し条件が追従状態に連動する。

### EX-UT-016 Guideクリーンアップ

- テスト観点: アンマウント時の監視解除
- 実施手順:
  1. `watchPosition` が返す `watchId` を設定した状態でコンポーネントをアンマウントする。
- 期待結果:
  1. `clearWatch(watchId)` が1回呼ばれる。

## 7. 実装時の補足

- `react-leaflet` を実体描画するとテストが重くなりやすいため、props 透過型モックを推奨する。
- `location.state.predefinedRoute` は `window.history.replaceState` を呼ぶため、必要に応じてスパイ化する。
- `ExplorePage` の失敗系は画面文言より `isSearching` 復帰確認を優先アサートにする。
- `ExploreGuidePage` は geolocation 非対応時に即エラー状態へ入るため、別ケースとして追加してもよい。

## 8. 期待成果物

- `frontend/src/test/ExplorePage.spec.tsx`
- `frontend/src/test/ExploreGuidePage.spec.tsx`
- 上記 16 ケースを満たす単体テストコード
- 必要に応じた geolocation / leaflet / router モックユーティリティ
