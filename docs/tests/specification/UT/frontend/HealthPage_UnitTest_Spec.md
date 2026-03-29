# Health機能 単体テスト仕様書

## 1. 目的

`HealthPage` コンポーネントの単体テスト観点を整理し、
エンジン音診断、目視点検、手動 ODO 更新の基本挙動、入力制御、API 呼び出し、画面内状態変化を安定して検証できる状態にする。

対象実装:
- `frontend/pages/HealthPage.tsx`

関連境界:
- `apiFetch`
- `navigator.mediaDevices.getUserMedia`
- `MediaRecorder`
- `AudioContext`
- `requestAnimationFrame`
- `setInterval`
- `URL.createObjectURL`
- `window.alert`

## 2. テスト対象範囲

本仕様書で扱う範囲:
- 初期表示とモード切替
- エンジン音録音開始/停止と録音後プレビュー表示
- エンジン音解析 API 呼び出しと結果表示
- 画像選択、再選択、画像解析 API 呼び出しと結果表示
- 手動 ODO 入力バリデーション
- ODO 更新 API 呼び出しと更新結果表示
- 非同期処理中のボタン状態変化
- 異常系での `alert` 表示

本仕様書で扱わない範囲:
- `BottomNav` 自体の描画品質や遷移挙動
- CSS 崩れ、アニメーション品質、波形デザインの見た目検証
- `MediaRecorder` や `AudioContext` のブラウザ実装差異そのもの
- バックエンド `/api/health/*` の解析精度や業務ロジック品質
- 実機のマイク入力品質、端末依存の権限ダイアログ表示
- E2E レベルの通し検証

現時点の自動テスト実装状況:
- `frontend/src/test/HealthPage.spec.tsx` では、本仕様書の全 22 観点のうち優先度の高い 10 観点を先行して自動化している
- 実装済み観点は `HP-UT-001`、`HP-UT-008`、`HP-UT-013`、`HP-UT-015`、`HP-UT-016`、`HP-UT-017`、`HP-UT-018`、`HP-UT-019`、`HP-UT-020` である
- 未実装観点は結果ファイルの未確認事項として管理する

## 3. 前提条件

- テストフレームワークは `Vitest` + `@testing-library/react` + `@testing-library/user-event` を想定する。
- `HealthPage` は `MemoryRouter` 配下でレンダリングする。
- `apiFetch` はモック化する。
- `window.alert` はスパイ化する。
- 録音機能は `navigator.mediaDevices.getUserMedia`、`MediaRecorder`、`AudioContext`、`requestAnimationFrame`、`setInterval` をモック化する。
- `URL.createObjectURL` は固定値を返すモックを利用する。
- 画像入力は `input[type="file"]` への `File` 注入で再現する。

## 4. モック方針

### 4.1 API モック

対象:
- `apiFetch('/api/health/analyze-audio', ...)`
- `apiFetch('/api/health/analyze', ...)`
- `apiFetch('/api/health/mileage', ...)`

基本方針:
- 正常系は `ok: true` とし、`json()` で `data` を返す。
- 異常系は `ok: false` を返すケースと `throw` するケースを分けて持つ。
- API 応答は `normalizeAnalysisResult` の分岐が確認できるよう、必要最小限のプロパティを返す。

### 4.2 録音関連モック

対象:
- `navigator.mediaDevices.getUserMedia`
- `MediaRecorder`
- `AudioContext`
- `requestAnimationFrame`
- `cancelAnimationFrame`
- `setInterval`
- `clearInterval`

基本方針:
- `getUserMedia` 成功時は `MediaStream` モックを返し、`getTracks().forEach(stop)` の呼び出し確認を可能にする。
- `MediaRecorder` は `start` / `stop` / `ondataavailable` / `onstop` を制御可能なテストダブルを使う。
- `AudioContext` は `createMediaStreamSource` と `createAnalyser` だけを持つ軽量モックとする。
- タイマー系は fake timers を利用し、5 秒カウントダウンと自動停止を再現する。

### 4.3 画像・ブラウザ API モック

対象:
- `URL.createObjectURL`
- `window.alert`

基本方針:
- `createObjectURL` は音声・画像プレビュー用に固定 URL を返す。
- `alert` は正常系では未呼び出し、異常系では想定文言で呼ばれることを確認する。

## 5. テスト観点一覧

| ID | 観点 | 概要 |
| --- | --- | --- |
| HP-UT-001 | 初期表示 | ヘッダー、モード切替、音声診断 UI が初期表示される |
| HP-UT-002 | モード切替 | `audio` / `camera` / `odo` 切替で各セクション表示が変わり、関連結果がリセットされる |
| HP-UT-003 | 録音開始正常系 | 録音開始で `getUserMedia` と `MediaRecorder.start` が呼ばれ、録音中表示になる |
| HP-UT-004 | 録音停止手動 | 録音中トグルで停止し、波形と録音状態が初期化される |
| HP-UT-005 | 録音停止自動 | 5 秒経過で自動停止し、音声プレビューと診断開始ボタンが表示される |
| HP-UT-006 | 録音開始失敗 | マイク取得失敗時に `alert` を表示し、録音状態へ遷移しない |
| HP-UT-007 | エンジン音解析正常系 | 音声 Blob を `FormData` で送信し、結果を画面表示する |
| HP-UT-008 | エンジン音解析失敗応答 | `ok: false` 時に失敗 `alert` を表示する |
| HP-UT-009 | エンジン音解析例外 | `throw` 時に例外用 `alert` を表示する |
| HP-UT-010 | エンジン音解析中表示 | 解析中はボタンが `disabled` になり文言が `解析中...` へ変わる |
| HP-UT-011 | 画像選択 | 画像選択でプレビュー表示、結果リセット、アップロード導線表示が行われる |
| HP-UT-012 | 画像再選択 | 再撮影導線で画像と結果がクリアされる |
| HP-UT-013 | 画像解析正常系 | `log_type` と画像を送信し、スコア、所見、ODO 反映結果を表示する |
| HP-UT-014 | 画像解析対象未検出 | `isTargetDetected: false` 時にスコア表示が `-` になる |
| HP-UT-015 | 画像解析失敗系 | `ok: false` と例外時にそれぞれ `alert` を表示する |
| HP-UT-016 | ODO 未入力バリデーション | 空入力では API を呼ばず `alert` を表示する |
| HP-UT-017 | ODO 不正値バリデーション | 負数または数値変換不可の場合に API を呼ばず `alert` を表示する |
| HP-UT-018 | ODO 更新正常系 | 切り捨てた整数値で API を呼び、更新結果とメンテナンス状況を表示する |
| HP-UT-019 | ODO 更新失敗応答 | API エラー文言優先で `alert` を表示する |
| HP-UT-020 | ODO 更新例外 | 例外時に汎用 `alert` を表示する |
| HP-UT-021 | ODO 更新中表示 | 更新中はボタンが `disabled` になり文言が `更新中...` へ変わる |
| HP-UT-022 | アンマウント時クリーンアップ | タイマー、アニメーション、MediaStream の停止処理が呼ばれる |

## 6. 詳細テストケース

### HP-UT-001 初期表示

- テスト観点: 初期表示
- 実施手順:
  1. `HealthPage` をレンダリングする。
- 期待結果:
  1. `Health Check` が表示される。
  2. モード切替ボタン `エンジン診断`、`目視点検`、`手動ODO` が表示される。
  3. 初期状態で `エンジン診断` がアクティブである。
  4. 録音ボタンと波形エリアが表示される。
  5. 画像アップロード UI と ODO 入力 UI は非アクティブセクションである。

### HP-UT-002 モード切替

- テスト観点: モード切替時の状態初期化
- 実施手順:
  1. 画像選択または解析結果表示状態を作る。
  2. `手動ODO` または `エンジン診断` に切り替える。
- 期待結果:
  1. 選択モードに対応するセクションがアクティブになる。
  2. `imageFile`、`previewUrl`、`analysisResult` がリセットされる。
  3. `mileageSaveResult`、`mileageMaintenanceStatus` がリセットされる。

### HP-UT-003 録音開始正常系

- テスト観点: 録音開始
- 実施手順:
  1. `getUserMedia` 成功モックを設定する。
  2. 録音ボタンを押下する。
- 期待結果:
  1. `navigator.mediaDevices.getUserMedia({ audio: true })` が 1 回呼ばれる。
  2. `MediaRecorder.start()` が 1 回呼ばれる。
  3. `RECORDING... (5S)` が表示される。
  4. 既存の `engineResult`、`audioBlob`、`audioUrl` がクリアされる。

### HP-UT-004 録音停止手動

- テスト観点: 録音中の手動停止
- 実施手順:
  1. 録音開始状態を作る。
  2. 録音ボタンを再度押下する。
- 期待結果:
  1. `MediaRecorder.stop()` が呼ばれる。
  2. `isRecording` が false になる。
  3. 波形バーが初期値へ戻る。
  4. タイマーとアニメーションフレームが停止される。

### HP-UT-005 録音停止自動

- テスト観点: 5 秒経過時の自動停止
- 実施手順:
  1. fake timers で録音開始状態を作る。
  2. 5 秒分タイマーを進める。
  3. `MediaRecorder.ondataavailable` と `onstop` を発火させる。
- 期待結果:
  1. カウントダウンが `5 -> 0` に更新される。
  2. 自動的に録音停止処理が走る。
  3. `audio` 要素が表示される。
  4. `診断を開始する` ボタンが表示される。
  5. `URL.createObjectURL` が生成した URL が音声プレビューに設定される。

### HP-UT-006 録音開始失敗

- テスト観点: マイク取得失敗時の異常系
- 実施手順:
  1. `getUserMedia` を reject させる。
  2. 録音ボタンを押下する。
- 期待結果:
  1. `マイクへのアクセスが許可されていません。ブラウザの設定を確認してください。` が `alert` 表示される。
  2. 録音中表示へ遷移しない。
  3. `MediaRecorder.start()` は呼ばれない。

### HP-UT-007 エンジン音解析正常系

- テスト観点: 音声解析 API 呼び出し
- 実施手順:
  1. 録音済み状態を作る。
  2. `/api/health/analyze-audio` を成功応答でモックする。
  3. `診断を開始する` を押下する。
- 期待結果:
  1. `apiFetch('/api/health/analyze-audio', { method: 'POST', body: FormData })` が 1 回呼ばれる。
  2. `FormData` に `audio` が `engine_sound.webm` 名で格納される。
  3. 応答内容が正規化され、スコアと所見が表示される。
  4. `alert` は表示されない。

### HP-UT-008 エンジン音解析失敗応答

- テスト観点: 音声解析 API の `ok: false`
- 実施手順:
  1. 録音済み状態を作る。
  2. `/api/health/analyze-audio` を `ok: false` で返す。
  3. `診断を開始する` を押下する。
- 期待結果:
  1. `エンジン音の解析に失敗しました` が `alert` 表示される。
  2. 解析結果カードは表示されない。
  3. ボタンは再度操作可能になる。

### HP-UT-009 エンジン音解析例外

- テスト観点: 音声解析 API 例外
- 実施手順:
  1. `/api/health/analyze-audio` を `throw` させる。
  2. `診断を開始する` を押下する。
- 期待結果:
  1. `エンジン音解析中にエラーが発生しました` が `alert` 表示される。
  2. ボタンは再度操作可能になる。

### HP-UT-010 エンジン音解析中表示

- テスト観点: 非同期処理中の状態変化
- 実施手順:
  1. `/api/health/analyze-audio` を未解決 Promise にする。
  2. `診断を開始する` を押下する。
- 期待結果:
  1. ボタンが `disabled` になる。
  2. 文言が `解析中...` に変わる。
  3. 送信開始時に前回の `engineResult` はクリアされる。

### HP-UT-011 画像選択

- テスト観点: 画像ファイル選択時の表示
- 実施手順:
  1. `目視点検` モードへ切り替える。
  2. 画像ファイルをアップロードする。
- 期待結果:
  1. `previewUrl` が生成され、プレビュー画像が表示される。
  2. `analysisResult` がクリアされる。
  3. `アップロード` ボタンが表示される。

### HP-UT-012 画像再選択

- テスト観点: 再撮影導線
- 実施手順:
  1. 画像選択済み状態を作る。
  2. `再撮影・別画像を選択する` を押下する。
- 期待結果:
  1. 画像プレビューが非表示になる。
  2. `imageFile`、`previewUrl`、`analysisResult` がクリアされる。
  3. 画像ソース選択 UI が再表示される。

### HP-UT-013 画像解析正常系

- テスト観点: 画像解析 API 呼び出しと結果表示
- 実施手順:
  1. `目視点検` モードで画像選択済み状態を作る。
  2. 点検箇所に `chain` などを選択する。
  3. `/api/health/analyze` を成功応答で返す。
  4. `アップロード` を押下する。
- 期待結果:
  1. `apiFetch('/api/health/analyze', { method: 'POST', body: FormData })` が 1 回呼ばれる。
  2. `FormData` に `image` と `log_type` が格納される。
  3. 応答に `mileage` が含まれる場合、反映した走行距離が表示される。
  4. 応答に `score` と `feedback` が含まれる場合、健康度と所見が表示される。

### HP-UT-014 画像解析対象未検出

- テスト観点: `isTargetDetected: false` の表示
- 実施手順:
  1. `/api/health/analyze` 成功応答で `isTargetDetected: false` を返す。
  2. 画像解析を実行する。
- 期待結果:
  1. 健康度スコアの数値表示が `-` になる。
  2. 対象未検出時の色分岐に対応した表示になる。

### HP-UT-015 画像解析失敗系

- テスト観点: 画像解析の異常系
- 実施手順:
  1. `ok: false` を返すケースを実行する。
  2. `throw` するケースを実行する。
- 期待結果:
  1. `ok: false` 時は `Analysis failed` が `alert` 表示される。
  2. 例外時は `Analysis error occurred` が `alert` 表示される。
  3. 処理後にボタンは再度操作可能になる。

### HP-UT-016 ODO 未入力バリデーション

- テスト観点: 手動 ODO 必須入力
- 実施手順:
  1. `手動ODO` モードへ切り替える。
  2. 入力を空のまま `ODOを更新する` を押下する。
- 期待結果:
  1. `手動ODOを入力してください` が `alert` 表示される。
  2. `apiFetch` は呼ばれない。

### HP-UT-017 ODO 不正値バリデーション

- テスト観点: 不正値入力の防止
- 実施手順:
  1. `-1` または数値変換不正となる値を入力する。
  2. `ODOを更新する` を押下する。
- 期待結果:
  1. `手動ODOは0以上の数値で入力してください` が `alert` 表示される。
  2. `apiFetch` は呼ばれない。

### HP-UT-018 ODO 更新正常系

- テスト観点: ODO 更新 API 呼び出し
- 実施手順:
  1. `12345.9` を入力する。
  2. `/api/health/mileage` を成功応答で返す。
  3. `ODOを更新する` を押下する。
- 期待結果:
  1. `apiFetch('/api/health/mileage', { method: 'PUT', body: JSON.stringify({ mileage: 12345 }) })` が呼ばれる。
  2. 更新後カードに `12,345 km` が表示される。
  3. `oil_maintenance_status` がある場合、残距離または超過距離文言が表示される。

### HP-UT-019 ODO 更新失敗応答

- テスト観点: ODO 更新 API の `ok: false`
- 実施手順:
  1. `/api/health/mileage` を `ok: false` で返し、`json()` で `error` を返す。
  2. `ODOを更新する` を押下する。
- 期待結果:
  1. 応答の `error` 文言が優先して `alert` 表示される。
  2. 成功カードは表示されない。
  3. ボタンは再度操作可能になる。

### HP-UT-020 ODO 更新例外

- テスト観点: ODO 更新 API 例外
- 実施手順:
  1. `/api/health/mileage` を `throw` させる。
  2. `ODOを更新する` を押下する。
- 期待結果:
  1. `ODO更新中にエラーが発生しました` が `alert` 表示される。
  2. ボタンは再度操作可能になる。

### HP-UT-021 ODO 更新中表示

- テスト観点: ODO 更新中の状態変化
- 実施手順:
  1. `/api/health/mileage` を未解決 Promise にする。
  2. `ODOを更新する` を押下する。
- 期待結果:
  1. ボタンが `disabled` になる。
  2. 文言が `更新中...` に変わる。
  3. 送信開始時に前回の `mileageSaveResult` と `mileageMaintenanceStatus` はクリアされる。

### HP-UT-022 アンマウント時クリーンアップ

- テスト観点: アンマウント時の後始末
- 実施手順:
  1. 録音中状態を作る。
  2. コンポーネントをアンマウントする。
- 期待結果:
  1. `cancelAnimationFrame` が呼ばれる。
  2. `clearInterval` が呼ばれる。
  3. `stream.getTracks().forEach(stop)` が呼ばれる。

## 7. 実装時の補足

- `HealthPage` は内部関数 `normalizeAnalysisResult` を通して API 応答を丸めているため、不要プロパティや型不正値が UI に反映されないことを必要に応じて追加観点にしてもよい。
- `handleModeChange` は `audio` 側の録音状態までは停止しないため、モード切替中に録音を継続する仕様かどうかは別途確認余地がある。
- `manualMileage` は `type="number"` だが、テストでは DOM 入力値を文字列として扱う前提で確認する。
- 録音波形そのものの値変化は視覚品質ではなく、`requestAnimationFrame` の継続呼び出しと state 更新有無の確認に留める。

## 8. 期待成果物

- 単体テスト仕様書: `docs/tests/specification/HealthPage_UnitTest_Spec.md`
- 必要に応じた将来のテストエビデンス出力先: `docs/tests/result`

## 9. 未確認事項・残リスク

- `MediaRecorder` と `AudioContext` はテスト環境に実体がない可能性が高く、モック実装品質に依存する。
- `input type="file"` の `capture="environment"` は JSDOM 上で実機挙動を再現できないため、選択イベントのみの確認になる。
- `health` 機能全体にはバックエンド API も存在するが、本仕様書は既存ドキュメント構成に合わせて `HealthPage` の単体テストを主対象としている。
