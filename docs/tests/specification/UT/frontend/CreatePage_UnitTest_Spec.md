# Create画面 単体テスト仕様書

## 1. 目的

`CreatePage` コンポーネントの単体テスト観点を整理し、画像選択、テーマ変更、強度調整、生成 API 呼び出し、保存処理の基本挙動を安定して検証できる状態にする。

対象実装:
- `frontend/pages/CreatePage.tsx`

関連境界:
- `apiFetch`
- `URL.createObjectURL`
- `AbortController`
- `window.setTimeout`
- `document.createElement`

## 2. テスト対象範囲

本仕様書で扱う範囲:
- 初期表示
- 画像未選択時の UI 状態
- 画像選択時の状態初期化
- 自動生成 API 呼び出し
- テーマ切替時の再生成予約
- 強度スライダー変更時の状態変化
- 強度操作完了時の再生成予約
- API 正常応答時の加工画像反映
- API 異常時の UI 挙動
- 保存ボタン押下時のダウンロード処理
- アンマウント時のタイマー破棄とリクエスト中断

本仕様書で扱わない範囲:
- バックエンド `/api/create/generate` の画像変換品質
- 実画像の見た目や CSS レイアウトの視覚差分
- Unsplash 画像 URL の表示可否
- ブラウザ実機でのファイル選択ダイアログ挙動
- ダウンロードされたファイル実体の内容確認

## 3. 前提条件

- テストフレームワークは `Vitest` + `@testing-library/react` + `@testing-library/user-event` を想定する。
- `CreatePage` は `MemoryRouter` 配下でレンダリングする。
- `apiFetch` はモック化する。
- `BottomNav` は描画有無のみとし、詳細挙動は本仕様書の対象外とする。
- `URL.createObjectURL` は固定値を返すようモック化する。
- `window.setTimeout` / `window.clearTimeout` を検証するため、必要に応じて fake timer を利用する。
- `AbortController` の `abort` 呼び出しを検証できるようスパイ化する。

## 4. モック方針

### 4.1 API モック

対象:
- `apiFetch('/api/create/generate', options)`

基本方針:
- 正常系は `ok: true` と `processed_images` を含む JSON を返す。
- 異常系は `ok: false` の応答と `reject` の両方を分けて持つ。
- `AbortError` は通常エラーと分けて扱い、UI に副作用が出ないことを確認する。

### 4.2 ブラウザ API モック

対象:
- `URL.createObjectURL`
- `document.createElement`
- `document.body.appendChild`
- `document.body.removeChild`
- `window.alert`

基本方針:
- 画像選択時は `blob:preview-1` など固定 URL を返す。
- ダウンロード処理では `a` 要素の `href`、`download`、`click` を検証する。
- 手動生成エラー表示は現実装では存在しないため、通常は `alert` が呼ばれないことを前提とする。

### 4.3 タイマー・中断制御モック

対象:
- `window.setTimeout`
- `window.clearTimeout`
- `AbortController`

基本方針:
- 画像選択後の 150ms 自動生成予約を確認する。
- テーマ変更時の 180ms、強度操作完了時の 120ms の再生成予約を確認する。
- 新規生成開始時に先行リクエストが `abort()` されることを確認する。

## 5. テスト観点一覧

| ID | 観点 | 概要 |
| --- | --- | --- |
| CR-UT-001 | 初期表示 | タイトル、アップロード導線、テーマ一覧、強度 UI、保存ボタンが表示される |
| CR-UT-002 | 初期状態 | 画像未選択時は保存ボタンが非活性で比較スライダーは表示されない |
| CR-UT-003 | 画像選択 | 画像選択時にプレビュー URL を保持し、テーマと強度を初期値へ戻す |
| CR-UT-004 | 初回自動生成予約 | 画像選択後 150ms で `cyberpunk` / `50` の条件で生成 API を呼ぶ |
| CR-UT-005 | テーマ切替 | テーマ切替時に選択状態を更新し、スライダー値を 50 に戻して再生成予約する |
| CR-UT-006 | 強度変更 | 強度スライダー変更時に現在値表示が更新される |
| CR-UT-007 | 強度操作完了 | Pointer/Mouse/Touch/Blur 完了時に再生成予約する |
| CR-UT-008 | 正常応答反映 | API 正常応答時に `processedUrl` を反映し After 画像と比較スライダーを表示する |
| CR-UT-009 | エラー応答 | 自動生成失敗時は alert を出さず、既存プレビューを維持する |
| CR-UT-010 | AbortError | 中断エラー時はエラーハンドリングせず UI を維持する |
| CR-UT-011 | 多重生成制御 | 新しい生成開始時に直前リクエストを abort し、最新応答のみ反映する |
| CR-UT-012 | 保存処理 | 加工済み画像があればそれを、なければ元画像をダウンロード対象にする |
| CR-UT-013 | アンマウント | アンマウント時にタイマーを破棄し、進行中リクエストを abort する |
| CR-UT-014 | ファイル未選択ガード | 画像未選択状態では生成 API を呼ばない |
| CR-UT-015 | API例外系 | `apiFetch` が例外 reject した場合の UI 維持とエラーハンドリングを確認する |
| CR-UT-016 | file input再選択 | 同一ファイル再選択を許容するため `input.value` が空文字リセットされる |
| CR-UT-017 | 保存ボタン無効時 | 画像未選択で保存押下してもダウンロード処理が発火しない |
| CR-UT-018 | 無効レスポンス耐性 | `processed_images` 欠損/空配列応答でもクラッシュしない |

## 6. 詳細テストケース

### CR-UT-001 初期表示

- 目的: 主要 UI が描画されることを確認する。
- 操作:
  1. `CreatePage` をレンダリングする。
- 期待結果:
  1. `Create Editor` が表示される。
  2. `ADD PHOTOS` と `タップして画像を選択` が表示される。
  3. テーマカードが 4 件表示される。
  4. `STRENGTH` と `現在値: 50` が表示される。
  5. `画像を保存する` ボタンが表示される。

### CR-UT-002 初期状態

- 目的: 画像未選択時の表示状態を確認する。
- 操作:
  1. 初期レンダリングする。
- 期待結果:
  1. 保存ボタンは `disabled`。
  2. Before / After 画像は表示されない。
  3. 比較用レンジスライダーは表示されない。

### CR-UT-003 画像選択

- 目的: 画像選択時に関連 state が初期化されることを確認する。
- 事前条件:
  - `URL.createObjectURL` は `blob:preview-1` を返す。
- 操作:
  1. ファイル入力に画像ファイル 1 件を設定する。
- 期待結果:
  1. Before 画像が `blob:preview-1` で表示される。
  2. 選択テーマは `cyberpunk` になる。
  3. 強度表示は `現在値: 50` になる。
  4. 既存タイマーがあれば `clearTimeout` される。

### CR-UT-004 初回自動生成予約

- 目的: 画像選択後に初回自動生成が予約されることを確認する。
- 事前条件:
  - fake timer を使用する。
  - `apiFetch` は成功応答を返す。
- 操作:
  1. 画像ファイルを選択する。
  2. 150ms 経過させる。
- 期待結果:
  1. `apiFetch` が 1 回呼ばれる。
  2. エンドポイントは `/api/create/generate`。
  3. `FormData` に `theme=cyberpunk`、`intensity=50`、`images=<選択ファイル>` が含まれる。

### CR-UT-005 テーマ切替

- 目的: テーマ変更時の state 更新と再生成予約を確認する。
- 事前条件:
  - 画像選択済みであること。
- 操作:
  1. `Vintage` テーマカードを押下する。
- 期待結果:
  1. `Vintage` カードが選択状態になる。
  2. 比較スライダー値が 50 に戻る。
  3. 180ms の再生成予約が行われる。
  4. 予約実行後の API 引数に `theme=vintage` が含まれる。

### CR-UT-006 強度変更

- 目的: 強度スライダー操作が表示値へ反映されることを確認する。
- 事前条件:
  - 画像選択済みであること。
- 操作:
  1. 強度スライダーを `72` に変更する。
- 期待結果:
  1. `現在値: 72` が表示される。
  2. この時点では API はまだ再呼び出しされない。

### CR-UT-007 強度操作完了

- 目的: 強度操作完了時に再生成予約されることを確認する。
- 事前条件:
  - 画像選択済みであること。
  - fake timer を使用する。
- 操作:
  1. 強度スライダーを変更する。
  2. `pointerUp` または `mouseUp` を発火する。
  3. 120ms 経過させる。
- 期待結果:
  1. 再生成 API が呼ばれる。
  2. API 引数に更新後の `intensity` が含まれる。
  3. 操作完了後 `isIntensitySliding` 相当のライブプレビュー状態が解除される。

### CR-UT-008 正常応答反映

- 目的: 生成成功時に加工済み画像が UI へ反映されることを確認する。
- 事前条件:
  - `apiFetch` は `processed_images[0].data_url = 'data:image/jpeg;base64,processed'` を返す。
- 操作:
  1. 画像選択後、自動生成を完了させる。
- 期待結果:
  1. After 画像が表示される。
  2. 比較スライダーが表示される。
  3. `BEFORE` / `AFTER` バッジが表示される。

### CR-UT-009 エラー応答

- 目的: 自動生成失敗時の UI 影響を確認する。
- 事前条件:
  - `apiFetch` は `ok: false` と `{ error: '画像変換に失敗しました。' }` を返す。
- 操作:
  1. 画像選択後、自動生成を実行する。
- 期待結果:
  1. `window.alert` は呼ばれない。
  2. Before 画像は維持される。
  3. After 画像は表示されない。
  4. `console.error` が呼ばれる。

### CR-UT-010 AbortError

- 目的: 中断エラー時に不要なエラー表示をしないことを確認する。
- 事前条件:
  - `apiFetch` は `name: 'AbortError'` を持つ例外で reject する。
- 操作:
  1. 生成処理を開始する。
- 期待結果:
  1. `window.alert` は呼ばれない。
  2. `console.error` は呼ばれない。
  3. UI 状態は変化しない。

### CR-UT-011 多重生成制御

- 目的: 最新リクエストのみを反映することを確認する。
- 事前条件:
  - 1 回目の API は遅延応答、2 回目は先に成功応答を返す。
- 操作:
  1. 画像選択後、1 回目の生成を開始する。
  2. テーマ変更または強度変更で 2 回目の生成を開始する。
  3. 2 回目を先に解決し、その後 1 回目を解決する。
- 期待結果:
  1. 2 回目開始時に 1 回目の `AbortController.abort()` が呼ばれる。
  2. 最終的な After 画像は 2 回目の応答内容になる。
  3. 1 回目の遅延応答で表示が上書きされない。

### CR-UT-012 保存処理

- 目的: ダウンロード対象 URL の優先順位を確認する。
- 事前条件:
  - `document.createElement('a')` をモック化する。
- 操作:
  1. 加工済み画像ありの状態で保存ボタンを押下する。
  2. 加工済み画像なしの状態でも保存ボタンを押下する。
- 期待結果:
  1. 加工済み画像ありでは `href` に `processedUrl` が設定される。
  2. 加工済み画像なしでは `href` に `previewUrl` が設定される。
  3. `download` 属性は `ride_styled_*.jpg` 形式になる。
  4. `appendChild` -> `click` -> `removeChild` の順で実行される。

### CR-UT-013 アンマウント

- 目的: クリーンアップ処理が正しく動くことを確認する。
- 事前条件:
  - タイマー予約済み、または生成リクエスト進行中の状態を作る。
- 操作:
  1. コンポーネントをアンマウントする。
- 期待結果:
  1. 保持中のタイマーに対して `clearTimeout` が呼ばれる。
  2. 進行中リクエストの `AbortController.abort()` が呼ばれる。

### CR-UT-014 ファイル未選択ガード

- 目的: 画像未選択時に生成処理が走らないことを確認する。
- 操作:
  1. 初期状態（画像未選択）でテーマカードを押下する。
  2. 強度スライダーを操作完了する。
- 期待結果:
  1. `apiFetch('/api/create/generate', ...)` は呼ばれない。
  2. エラー表示やクラッシュが発生しない。

### CR-UT-015 API例外系

- 目的: `ok:false` 以外の例外 reject 時の挙動を確認する。
- 事前条件:
  - `apiFetch` は `new Error('network fail')` で reject する。
- 操作:
  1. 画像選択後に自動生成を実行する。
- 期待結果:
  1. `console.error` が呼ばれる。
  2. 自動生成モードでは `window.alert` は呼ばれない。
  3. Before 画像表示は維持される。

### CR-UT-016 file input再選択

- 目的: 同一ファイルの連続選択を許容する実装を確認する。
- 操作:
  1. ファイル入力で画像を選択する。
  2. `input.value` の値を確認する。
- 期待結果:
  1. `handleFileSelect` 実行後に `input.value === ''` となる。

### CR-UT-017 保存ボタン無効時

- 目的: 無効状態での保存処理未発火を確認する。
- 操作:
  1. 画像未選択状態で保存ボタンを押下する。
- 期待結果:
  1. `document.createElement('a')` は呼ばれない。
  2. `appendChild` / `removeChild` は呼ばれない。

### CR-UT-018 無効レスポンス耐性

- 目的: 不完全レスポンスに対する耐性を確認する。
- 事前条件:
  - `apiFetch` は `ok:true` だが `processed_images` が `undefined` または `[]` を返す。
- 操作:
  1. 画像選択後に自動生成を実行する。
- 期待結果:
  1. 例外を投げず処理が完了する。
  2. `processedUrl` は `null` のまま維持される。
  3. 比較スライダーは表示されない。

## 7. 実装時の補足

- `FormData` の検証は、モック呼び出し引数から `get('theme')`、`get('intensity')`、`get('images')` を参照して行う。
- `type="file"` の入力は `userEvent.upload` を優先し、必要に応じて `fireEvent.change` を併用する。
- 自動生成はタイマー駆動のため、`vi.useFakeTimers()` と `vi.advanceTimersByTime()` を前提に組むと安定しやすい。
- `lucide-react` アイコン自体は単体テスト対象外とし、文言ベースで UI を取得する。
- 現実装に手動生成ボタンは存在しないため、`generateImage` の `auto: false` 分岐は本仕様書の対象外とする。

## 8. 期待成果物

- `CreatePage.spec.tsx` または同等ファイル
- 上記 18 ケースを満たす単体テストコード
- 必要に応じた `apiFetch`、`URL.createObjectURL`、`AbortController`、ダウンロード処理のモックユーティリティ
