# Setting機能 単体テスト仕様書

## 1. 目的

`SettingPage` コンポーネントの単体テスト観点を整理し、
プロフィール設定、オイル管理、アプリ設定、問い合わせ導線、アカウント操作、背景画像変更の基本挙動を安定して検証できる状態にする。

対象実装:
- `frontend/pages/SettingPage.tsx`

関連境界:
- `useAuth`
- `apiFetch`
- `react-router-dom` の `useNavigate`
- `localStorage`
- `FileReader`
- `getCroppedImg`
- `document.createElement('canvas')`
- `window.confirm`
- `supabase.auth.signOut`

## 2. テスト対象範囲

本仕様書で扱う範囲:
- 初期表示と `profileData` 反映
- プロフィール編集開始、キャンセル、保存
- オイル管理入力バリデーションと保存
- 交換推奨距離文言の表示分岐
- デフォルト走行時間の保存
- 背景画像アップロード、クロップモーダル表示、保存
- 問い合わせ画面への遷移導線
- サインアウト
- 退会確認、退会 API 呼び出し、成功後のサインアウト
- 非同期処理中のボタン状態変化

本仕様書で扱わない範囲:
- `BottomNav` 自体の表示品質や遷移挙動
- `react-easy-crop` のライブラリ内部挙動
- Canvas の描画品質そのもの
- バックエンド `/api/users/me` の業務ロジック品質
- Supabase セッション管理の内部仕様
- 実ブラウザでのファイル選択 UI、ネイティブ日付入力 UI の見た目検証
- E2E レベルの通し検証

## 3. 前提条件

- テストフレームワークは `Vitest` + `@testing-library/react` + `@testing-library/user-event` を想定する。
- `SettingPage` は `MemoryRouter` 配下でレンダリングする。
- `useAuth` は `profileData` と `refreshProfile` を制御できるようモック化する。
- `useNavigate` は遷移要求確認のためモック化する。
- `apiFetch` はモック化する。
- `localStorage` はスパイ化し、`getItem` / `setItem` を制御する。
- 背景画像変更は `FileReader`、`getCroppedImg`、`Image`、`canvas` をモック化する。
- `window.confirm` は true / false を切り替えられるようにする。
- `supabase` モジュールは動的 import を考慮してモック化する。

## 4. モック方針

### 4.1 認証・API モック

対象:
- `useAuth`
- `apiFetch('/api/users/me', ...)`
- `supabase.auth.signOut`
- `useNavigate`

基本方針:
- `useAuth` は `profileData` と `refreshProfile` を返す。
- `apiFetch` はプロフィール更新、オイル管理更新、退会処理の各ケースで `ok: true`、`ok: false`、`throw` を切り替える。
- `signOut` は成功前提を基本とし、呼び出し回数確認を行う。
- `navigate` は `/settings/contact` と `/` の遷移要求を検証する。

### 4.2 ストレージ・ブラウザ API モック

対象:
- `localStorage.getItem`
- `localStorage.setItem`
- `window.confirm`
- `FileReader`
- `Image`
- `document.createElement('canvas')`

基本方針:
- `default_riding_time` と `home_bg_image` の保存可否を切り替える。
- `window.confirm` は退会確認の yes / no を切り替える。
- `FileReader` は `readAsDataURL` 後に `onload` を呼び、画像データ URL を返す。
- `canvas` は `getContext`、`toDataURL` を持つ軽量モックとする。

### 4.3 クロップ関連モック

対象:
- `getCroppedImg`
- `react-easy-crop`

基本方針:
- `Cropper` は軽量プレースホルダー化し、`onCropComplete` と `onZoomChange` をテストから制御できるようにする。
- `getCroppedImg` は成功時に Blob URL 相当文字列、失敗時に例外を返す。

## 5. テスト観点一覧

| ID | 観点 | 概要 |
| --- | --- | --- |
| ST-UT-001 | 初期表示 | `profileData` と `localStorage` に基づいて各フォーム初期値が表示される |
| ST-UT-002 | プロフィール編集開始 | `編集` 押下で入力欄が活性化し保存 UI に切り替わる |
| ST-UT-003 | プロフィール編集キャンセル | キャンセルで編集状態を解除し、`profileData` の値へ戻す |
| ST-UT-004 | プロフィール保存正常系 | `PUT /api/users/me` を正しい payload で呼び、成功メッセージと `refreshProfile` を実行する |
| ST-UT-005 | プロフィール保存失敗応答 | `ok: false` 時に API エラー文言を表示する |
| ST-UT-006 | プロフィール保存例外 | 例外時に通信エラーメッセージを表示する |
| ST-UT-007 | オイル管理初期表示 | オイル関連項目と残距離文言が `profileData` に応じて表示される |
| ST-UT-008 | オイル管理バリデーション1 | 前回オイル交換時走行距離が負数または不正値なら API を呼ばない |
| ST-UT-009 | オイル管理バリデーション2 | 月間走行距離が負数または不正値なら API を呼ばない |
| ST-UT-010 | オイル管理バリデーション3 | オイル交換サイクルが負数または不正値なら API を呼ばない |
| ST-UT-011 | オイル管理保存正常系 | 数値変換済み payload で保存し、成功メッセージと `refreshProfile` を実行する |
| ST-UT-012 | オイル管理保存失敗応答 | `ok: false` 時に API エラー文言を表示する |
| ST-UT-013 | オイル管理保存例外 | 例外時に通信エラーメッセージを表示する |
| ST-UT-014 | デフォルト走行時間保存 | セレクト変更で `localStorage` 更新と成功メッセージ表示を行う |
| ST-UT-015 | 背景画像選択 | 画像選択で `FileReader` を通じてクロップモーダルを表示する |
| ST-UT-016 | 背景画像クロップ保存正常系 | クロップ保存で `home_bg_image` を保存し成功メッセージを表示する |
| ST-UT-017 | 背景画像保存容量超過 | `localStorage.setItem` 失敗時にサイズ超過メッセージを表示する |
| ST-UT-018 | 背景画像クロップ失敗 | `getCroppedImg` 失敗時に切り抜き失敗メッセージを表示する |
| ST-UT-019 | クロップキャンセル | キャンセルでモーダルを閉じ、画像ソースをクリアする |
| ST-UT-020 | 問い合わせ導線 | `問い合わせフォームを開く` 押下で `/settings/contact` へ遷移要求する |
| ST-UT-021 | サインアウト | `supabase.auth.signOut` 実行後に `/` へ遷移要求する |
| ST-UT-022 | 退会確認キャンセル | `confirm` が false の場合は API を呼ばない |
| ST-UT-023 | 退会正常系 | `DELETE /api/users/me` 成功後に `signOut` と `/` 遷移を行う |
| ST-UT-024 | 退会失敗応答 | `ok: false` 時に API エラー文言を表示する |
| ST-UT-025 | 退会例外 | 例外時に通信エラーメッセージを表示する |
| ST-UT-026 | ローディング表示 | 保存・退会処理中に対象ボタン文言と `disabled` 状態が変わる |

## 6. 詳細テストケース

### ST-UT-001 初期表示

- テスト観点: 初期表示
- 実施手順:
  1. `profileData` にユーザー名、車両情報、オイル管理情報を含めて `SettingPage` をレンダリングする。
  2. `localStorage.getItem('default_riding_time')` に `90` を返す。
- 期待結果:
  1. `Settings` が表示される。
  2. プロフィール欄に `display_name`、姓、名、メーカー、車種名が反映される。
  3. オイル管理欄に日付と数値項目が反映される。
  4. デフォルト走行時間セレクトに `90` が初期表示される。
  5. プロフィール入力欄は初期状態で `disabled` である。

### ST-UT-002 プロフィール編集開始

- テスト観点: 編集開始
- 実施手順:
  1. `編集` ボタンを押下する。
- 期待結果:
  1. プロフィール入力欄が活性化される。
  2. `キャンセル` と `保存する` ボタンが表示される。
  3. `編集` ボタンは非表示になる。

### ST-UT-003 プロフィール編集キャンセル

- テスト観点: キャンセル時の値復元
- 実施手順:
  1. 編集開始後、表示名などを変更する。
  2. `キャンセル` を押下する。
- 期待結果:
  1. 編集状態が解除される。
  2. `message` はクリアされる。
  3. `profileData` の元の値が再表示される。

### ST-UT-004 プロフィール保存正常系

- テスト観点: プロフィール保存 API 呼び出し
- 実施手順:
  1. 編集状態で各入力値を変更する。
  2. `/api/users/me` を `ok: true` で返す。
  3. `保存する` を押下する。
- 期待結果:
  1. `apiFetch('/api/users/me', { method: 'PUT', body: JSON.stringify(...) })` が 1 回呼ばれる。
  2. payload に `first_name`、`last_name`、`display_name`、`vehicle_maker`、`vehicle_model_name` が含まれる。
  3. `プロフィールを更新しました。` が表示される。
  4. `isEditing` が false になる。
  5. `refreshProfile` が 1 回呼ばれる。

### ST-UT-005 プロフィール保存失敗応答

- テスト観点: プロフィール保存 API の `ok: false`
- 実施手順:
  1. `/api/users/me` を `ok: false` で返し、`json()` で `error` を返す。
  2. `保存する` を押下する。
- 期待結果:
  1. API の `error` 文言が表示される。
  2. 編集状態は維持される。
  3. `refreshProfile` は呼ばれない。

### ST-UT-006 プロフィール保存例外

- テスト観点: プロフィール保存例外
- 実施手順:
  1. `/api/users/me` を `throw` させる。
  2. `保存する` を押下する。
- 期待結果:
  1. `通信エラーが発生しました。` が表示される。
  2. ローディング状態が解除される。

### ST-UT-007 オイル管理初期表示

- テスト観点: オイル管理表示分岐
- 実施手順:
  1. `oil_maintenance_status.remaining_km` が正数、負数、`null`、未設定の各パターンでレンダリングする。
- 期待結果:
  1. 正数時は `交換推奨まであとxxxkmです。` が表示される。
  2. 負数時は `交換推奨距離をxxxkm超過しています。` が表示される。
  3. `remaining_km === null` 時は現在走行距離と前回交換時走行距離が必要な文言が表示される。
  4. `oil_maintenance_status` がない時はサイクル設定を促す文言が表示される。

### ST-UT-008 オイル管理バリデーション1

- テスト観点: 前回オイル交換時走行距離の検証
- 実施手順:
  1. `last_oil_change_mileage` に負数または不正値相当を設定する。
  2. `オイル管理を保存` を押下する。
- 期待結果:
  1. `前回オイル交換時の走行距離は0以上の数値で入力してください。` が表示される。
  2. `apiFetch` は呼ばれない。

### ST-UT-009 オイル管理バリデーション2

- テスト観点: 月間走行距離の検証
- 実施手順:
  1. `monthly_avg_mileage` に負数または不正値相当を設定する。
  2. `オイル管理を保存` を押下する。
- 期待結果:
  1. `一ヶ月あたりの平均走行距離は0以上の数値で入力してください。` が表示される。
  2. `apiFetch` は呼ばれない。

### ST-UT-010 オイル管理バリデーション3

- テスト観点: オイル交換サイクルの検証
- 実施手順:
  1. `oil_change_interval_km` に負数または不正値相当を設定する。
  2. `オイル管理を保存` を押下する。
- 期待結果:
  1. `オイル交換サイクルは0以上の数値で入力してください。` が表示される。
  2. `apiFetch` は呼ばれない。

### ST-UT-011 オイル管理保存正常系

- テスト観点: オイル管理保存 API 呼び出し
- 実施手順:
  1. 各入力に日付と数値文字列を設定する。
  2. `/api/users/me` を `ok: true` で返す。
  3. `オイル管理を保存` を押下する。
- 期待結果:
  1. payload に `last_oil_change_date`、`last_oil_change_mileage`、`monthly_avg_mileage`、`oil_change_interval_km` が数値変換済みで含まれる。
  2. 空欄項目は `null` として送信される。
  3. `オイル管理情報を更新しました。` が表示される。
  4. `refreshProfile` が 1 回呼ばれる。

### ST-UT-012 オイル管理保存失敗応答

- テスト観点: オイル管理保存 API の `ok: false`
- 実施手順:
  1. `/api/users/me` を `ok: false` で返し、`json()` で `error` を返す。
  2. `オイル管理を保存` を押下する。
- 期待結果:
  1. API の `error` 文言が表示される。
  2. `refreshProfile` は呼ばれない。

### ST-UT-013 オイル管理保存例外

- テスト観点: オイル管理保存例外
- 実施手順:
  1. `/api/users/me` を `throw` させる。
  2. `オイル管理を保存` を押下する。
- 期待結果:
  1. `通信エラーが発生しました。` が表示される。
  2. ローディング状態が解除される。

### ST-UT-014 デフォルト走行時間保存

- テスト観点: アプリ設定保存
- 実施手順:
  1. デフォルト走行時間セレクトを別の値へ変更する。
- 期待結果:
  1. `localStorage.setItem('default_riding_time', <value>)` が呼ばれる。
  2. `デフォルトの走行時間を更新しました。` が表示される。

### ST-UT-015 背景画像選択

- テスト観点: 画像選択時のクロップ開始
- 実施手順:
  1. `背景画像を変更する` を押下し、ファイル入力に画像を設定する。
  2. `FileReader.onload` を発火させる。
- 期待結果:
  1. `FileReader.readAsDataURL` が呼ばれる。
  2. `isCropping` が true になる。
  3. クロップモーダルが表示される。
  4. file input の値がクリアされる。

### ST-UT-016 背景画像クロップ保存正常系

- テスト観点: 背景画像保存
- 実施手順:
  1. クロップモーダル表示状態を作る。
  2. `getCroppedImg` を成功させる。
  3. `Image.onload` を発火させ、`canvas.toDataURL` が JPEG データ URL を返すようにする。
  4. `完了` を押下する。
- 期待結果:
  1. `getCroppedImg` が `cropImageSrc` と `croppedAreaPixels` で呼ばれる。
  2. `localStorage.setItem('home_bg_image', dataUrl)` が呼ばれる。
  3. `背景画像を更新しました。` が表示される。
  4. モーダルが閉じ、`cropImageSrc` がクリアされる。

### ST-UT-017 背景画像保存容量超過

- テスト観点: `localStorage` 保存失敗
- 実施手順:
  1. `localStorage.setItem('home_bg_image', ...)` を例外化する。
  2. 背景画像保存を実行する。
- 期待結果:
  1. `画像サイズが大きすぎます。` が表示される。
  2. モーダルが閉じる。
  3. ローディング状態が解除される。

### ST-UT-018 背景画像クロップ失敗

- テスト観点: 切り抜き失敗
- 実施手順:
  1. `getCroppedImg` を `throw` させる。
  2. `完了` を押下する。
- 期待結果:
  1. `画像の切り抜きに失敗しました。` が表示される。
  2. モーダルが閉じる。
  3. `cropImageSrc` がクリアされる。

### ST-UT-019 クロップキャンセル

- テスト観点: クロップモーダルキャンセル
- 実施手順:
  1. クロップモーダル表示状態で `キャンセル` を押下する。
- 期待結果:
  1. `isCropping` が false になる。
  2. `cropImageSrc` が `null` になる。
  3. モーダルが非表示になる。

### ST-UT-020 問い合わせ導線

- テスト観点: 問い合わせ画面への遷移要求
- 実施手順:
  1. `問い合わせフォームを開く` を押下する。
- 期待結果:
  1. `navigate('/settings/contact')` が 1 回呼ばれる。

### ST-UT-021 サインアウト

- テスト観点: サインアウト処理
- 実施手順:
  1. `サインアウト` を押下する。
- 期待結果:
  1. `supabase.auth.signOut()` が 1 回呼ばれる。
  2. `navigate('/')` が 1 回呼ばれる。

### ST-UT-022 退会確認キャンセル

- テスト観点: 退会確認ダイアログのキャンセル
- 実施手順:
  1. `window.confirm` が `false` を返すようにする。
  2. `退会する` を押下する。
- 期待結果:
  1. `apiFetch('/api/users/me', { method: 'DELETE' })` は呼ばれない。
  2. `signOut` は呼ばれない。
  3. ローディング状態へ遷移しない。

### ST-UT-023 退会正常系

- テスト観点: 退会処理成功
- 実施手順:
  1. `window.confirm` が `true` を返すようにする。
  2. `/api/users/me` を `ok: true` で返す。
  3. `退会する` を押下する。
- 期待結果:
  1. `apiFetch('/api/users/me', { method: 'DELETE' })` が 1 回呼ばれる。
  2. `supabase.auth.signOut()` が 1 回呼ばれる。
  3. `navigate('/')` が 1 回呼ばれる。

### ST-UT-024 退会失敗応答

- テスト観点: 退会 API の `ok: false`
- 実施手順:
  1. `window.confirm` が `true` を返すようにする。
  2. `/api/users/me` を `ok: false` で返し、`json()` で `error` を返す。
  3. `退会する` を押下する。
- 期待結果:
  1. API の `error` 文言が表示される。
  2. `signOut` と `navigate('/')` は呼ばれない。

### ST-UT-025 退会例外

- テスト観点: 退会 API 例外
- 実施手順:
  1. `window.confirm` が `true` を返すようにする。
  2. `/api/users/me` を `throw` させる。
  3. `退会する` を押下する。
- 期待結果:
  1. `通信エラーが発生しました。` が表示される。
  2. ローディング状態が解除される。

### ST-UT-026 ローディング表示

- テスト観点: 非同期処理中のボタン状態
- 実施手順:
  1. プロフィール保存、オイル管理保存、退会処理をそれぞれ未解決 Promise にする。
  2. 各処理を開始する。
- 期待結果:
  1. 保存対象ボタンが `disabled` になる。
  2. プロフィール保存とオイル管理保存では文言が `保存中...` になる。
  3. 退会処理では文言が `処理中...` になる。

## 7. 実装時の補足

- `isLoading` はプロフィール保存、オイル管理保存、背景画像保存、退会処理で共有されているため、同時操作時の副作用が起きうる。単体テストでは各処理を独立して確認する。
- `formatDateForInput` により不正な日付文字列は空文字へ変換されるため、必要に応じて追加観点として切り出してもよい。
- プロフィール欄の `required` はブラウザネイティブバリデーション依存のため、本仕様書では submit 前の DOM 制約検証までは主対象にしない。
- 背景画像保存は `Image.onload` 内で非同期に `localStorage` 更新を行うため、テストでは `onload` 発火タイミングを明示的に制御する。

## 8. 期待成果物

- 単体テスト仕様書: `docs/tests/specification/SettingPage_UnitTest_Spec.md`
- 必要に応じた将来のテストエビデンス出力先: `docs/tests/result`

## 9. 未確認事項・残リスク

- `react-easy-crop`、`canvas`、`Image` を含む背景画像変更処理は JSDOM 上で実装依存が強く、モック精度に左右される。
- `input type="date"` と `input type="number"` のブラウザ固有 UI は単体テストでは再現できない。
- `supabase` の動的 import モック方法はテスト構成に依存するため、実装時に調整が必要になる可能性がある。
