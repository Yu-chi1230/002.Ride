# Home画面 単体テスト仕様書

## 1. 目的

`HomePage` コンポーネントの単体テスト観点を整理し、
初期表示、最新ルート取得、通知ドロワー表示、お知らせデータ表示、画面遷移導線の基本挙動を安定して検証できる状態にする。

対象実装:
- `frontend/pages/HomePage.tsx`

関連境界:
- `useAuth` (`session`)
- `apiFetch` (`/api/explore/routes/latest`)
- `supabase.from('announcements').select().order()`
- `react-router-dom` の `useNavigate`
- `localStorage`

## 2. テスト対象範囲

本仕様書で扱う範囲:
- 初期表示
- 背景画像スタイルへの `localStorage` 反映
- 最新ルート取得 API 呼び出し（session 有無）
- 最新ルート取得成功時/失敗時の表示
- お知らせ取得成功時/失敗時の表示
- 通知ドロワーの開閉
- おすすめルートカード押下時の遷移
- 日付表示と個別通知ラベル表示

本仕様書で扱わない範囲:
- バックエンド `/api/explore/routes/latest` のレスポンス品質
- Supabase RLS の正当性
- CSS レイアウトの視覚差分
- `BottomNav` の内部挙動
- E2E レベルのナビゲーション通し検証

## 3. 前提条件

- テストフレームワークは `Vitest` + `@testing-library/react` + `@testing-library/user-event` を想定する。
- `HomePage` は `MemoryRouter` 配下でレンダリングする。
- `useAuth` は `session` あり/なしを切り替え可能にモック化する。
- `apiFetch` はモック化する。
- `supabase` のクエリチェーンはモック化する。
- `useNavigate` は呼び出し確認のためモック化する。
- `localStorage` はキーごとに値を制御できる状態で評価する。

## 4. モック方針

### 4.1 認証・API モック

対象:
- `useAuth().session`
- `apiFetch('/api/explore/routes/latest', {}, accessToken)`

基本方針:
- `session` ありのときのみ最新ルート API を呼ぶことを検証する。
- 成功系は `ok: true` + `json()` で `data.route` を返す。
- 失敗系は `ok: false` または `throw` を分けて検証する。

### 4.2 Supabase モック

対象:
- `supabase.from('announcements').select('*').order('start_date', { ascending: false })`

基本方針:
- 成功系は `data` 配列を返す。
- 失敗系は `error` を返すケースと `throw` を分ける。

### 4.3 Router / Storage モック

対象:
- `useNavigate`
- `localStorage.getItem('home_bg_image')`
- `localStorage.getItem('home_bg_position_y')`

基本方針:
- 遷移先と state 付き遷移の引数を確認する。
- 背景スタイルは `home-bg` 要素の `style` を確認する。

## 5. テスト観点一覧

| ID | 観点 | 概要 |
| --- | --- | --- |
| HM-UT-001 | 初期表示 | ロゴ、おすすめルートセクション、通知アイコン、BottomNav が表示される |
| HM-UT-002 | 背景画像適用 | `localStorage` の背景情報が `home-bg` の style に反映される |
| HM-UT-003 | 背景画像未設定 | 背景情報未設定時は `home-bg` に背景 style が適用されない |
| HM-UT-004 | 最新ルートAPI呼び出し条件 | `session` ありでのみ最新ルート API を呼ぶ |
| HM-UT-005 | 最新ルート取得成功表示 | API成功時におすすめカードへ最新ルート情報を表示する |
| HM-UT-006 | 最新ルート取得失敗表示 | API失敗時にデフォルトおすすめ表示を維持する |
| HM-UT-007 | お知らせ取得成功表示 | Supabase 取得データがドロワーに表示される |
| HM-UT-008 | お知らせ空状態 | お知らせ0件時に空状態メッセージを表示する |
| HM-UT-009 | お知らせ取得失敗耐性 | Supabase失敗時も画面崩壊せず空状態表示する |
| HM-UT-010 | ドロワー開閉 | 通知アイコン/オーバーレイ/閉じるボタンで開閉状態が切り替わる |
| HM-UT-011 | ルートカード遷移(最新あり) | 最新ルートあり時は `predefinedRoute` を付けて `/explore` へ遷移する |
| HM-UT-012 | ルートカード遷移(最新なし) | 最新ルートなし時は state なしで `/explore` へ遷移する |
| HM-UT-013 | 通知日付整形 | `start_date` が `YYYY.MM.DD` 形式で表示される |
| HM-UT-014 | 個別通知ラベル | `is_global=false` の通知に `あなたへ` ラベルを表示する |

## 6. 詳細テストケース

### HM-UT-001 初期表示

- テスト観点: 画面の主要 UI 要素表示
- 実施手順:
  1. `HomePage` をレンダリングする。
- 期待結果:
  1. `ride` ロゴが表示される。
  2. `おすすめルート` セクションが表示される。
  3. 通知アイコンが表示される。
  4. `BottomNav` が表示される。

### HM-UT-002 背景画像適用

- テスト観点: `localStorage` 背景情報の反映
- 実施手順:
  1. `home_bg_image` と `home_bg_position_y` を設定してレンダリングする。
- 期待結果:
  1. `.home-bg` に `backgroundImage` が設定される。
  2. `.home-bg` に `backgroundPosition` が `center {n}%` で設定される。

### HM-UT-003 背景画像未設定

- テスト観点: 背景情報未設定時のスタイル
- 実施手順:
  1. 背景キー未設定の状態でレンダリングする。
- 期待結果:
  1. `.home-bg` は背景画像 style 未設定（`undefined` 相当）である。

### HM-UT-004 最新ルートAPI呼び出し条件

- テスト観点: `session` 有無に応じた呼び出し制御
- 実施手順:
  1. `session` ありでレンダリングする。
  2. `session` なしでレンダリングする。
- 期待結果:
  1. `session` ありでは `/api/explore/routes/latest` が1回呼ばれる。
  2. `session` なしでは呼ばれない。

### HM-UT-005 最新ルート取得成功表示

- テスト観点: API成功時のおすすめカード表示
- 実施手順:
  1. 最新ルートAPIを成功応答で返す。
- 期待結果:
  1. ルートタイトルが `latestRoute.title` で表示される。
  2. 所要時間表示が `formatDuration` 形式（例: `1h 30m`）で表示される。
  3. 説明文に距離（`xx.xkm`）が含まれる。

### HM-UT-006 最新ルート取得失敗表示

- テスト観点: API失敗時のフォールバック
- 実施手順:
  1. 最新ルートAPIを `ok: false` または `throw` で失敗させる。
- 期待結果:
  1. デフォルトタイトル `新しいルートを生成` が表示される。
  2. デフォルト説明 `ExploreでAIにルートを作成してもらいましょう` が表示される。

### HM-UT-007 お知らせ取得成功表示

- テスト観点: お知らせ一覧描画
- 実施手順:
  1. Supabase 取得を成功させ、複数件データを返す。
  2. 通知アイコンを押してドロワーを開く。
- 期待結果:
  1. 各お知らせのタイトル/本文が表示される。
  2. 件数分の `.announcement-item` が表示される。

### HM-UT-008 お知らせ空状態

- テスト観点: 0件時表示
- 実施手順:
  1. Supabase 取得成功で空配列を返す。
  2. ドロワーを開く。
- 期待結果:
  1. `現在新しいお知らせはありません。` が表示される。

### HM-UT-009 お知らせ取得失敗耐性

- テスト観点: Supabase失敗時の表示維持
- 実施手順:
  1. Supabase が `error` を返す、または `throw` する。
  2. ドロワーを開く。
- 期待結果:
  1. コンポーネントがクラッシュしない。
  2. 空状態メッセージが表示される。

### HM-UT-010 ドロワー開閉

- テスト観点: 開閉操作
- 実施手順:
  1. 通知アイコン押下で開く。
  2. オーバーレイ押下で閉じる。
  3. 再度開き、`X` ボタンで閉じる。
- 期待結果:
  1. 開くと `.nav-drawer.open` と `.drawer-overlay.open` が付与される。
  2. 閉じると `open` クラスが外れる。

### HM-UT-011 ルートカード遷移(最新あり)

- テスト観点: 最新ルートあり時の遷移
- 実施手順:
  1. 最新ルートを取得した状態でおすすめカードを押下する。
- 期待結果:
  1. `navigate('/explore', { state: { predefinedRoute: latestRoute } })` が呼ばれる。

### HM-UT-012 ルートカード遷移(最新なし)

- テスト観点: 最新ルートなし時の遷移
- 実施手順:
  1. 最新ルートなし状態でおすすめカードを押下する。
- 期待結果:
  1. `navigate('/explore')` が呼ばれる。

### HM-UT-013 通知日付整形

- テスト観点: 日付表示フォーマット
- 実施手順:
  1. `start_date` を含むお知らせデータを返す。
  2. ドロワーを開く。
- 期待結果:
  1. 日付が `YYYY.MM.DD` 形式で表示される。

### HM-UT-014 個別通知ラベル

- テスト観点: グローバル/個別通知の表示差
- 実施手順:
  1. `is_global=false` と `is_global=true` のデータを混在させる。
  2. ドロワーを開く。
- 期待結果:
  1. `is_global=false` の項目に `あなたへ` が表示される。
  2. `is_global=true` の項目には `あなたへ` が表示されない。

## 7. 実装時の補足

- `formatDuration` は `mins=0` で空文字を返すため、境界値ケースを追加してもよい。
- `HomePage` の `useEffect` ではアンマウント後の state 更新抑止 (`isMounted`) があるため、
  非同期解決タイミングを制御するケースは `act` と Promise 制御を使う。
- `Bell` / `X` はアイコンコンポーネントのため、テストでは親要素のクリック導線を優先して検証する。

## 8. 期待成果物

- `frontend/src/test/HomePage.spec.tsx`
- 上記 14 ケースを満たす単体テストコード
- 必要に応じた `useAuth` / `apiFetch` / `supabase` モックユーティリティ
