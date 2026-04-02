# ride システムテスト結果

## 1. 実施概要
- 実施日時: 2026-04-01 22:10-22:12 JST
- 実施場所: `/Users/yusn/Documents/10.AiDev/002.Ride`
- 対象仕様: `docs/tests/specification/ST/Ride_SystemTest_Spec.md`
- 実施環境:
  - frontend container: `002ride-frontend-1`
  - backend container: `002ride-backend-1`
  - Supabase related containers: 起動済み
  - frontend URL: `http://localhost:5174`
  - backend URL: `http://localhost:8001`

## 2. 実施方法
- backend コンテナ内で一時スクリプトを実行し、API 応答と DB 反映を通し確認した。
- 認証は Supabase Auth を利用し、使い捨てユーザーを新規作成して実施した。
- DB 確認は backend コンテナ内から Postgres 接続で確認した。
- 画面に紐づく API/DB の成立性を中心に確認した。

## 3. 結果サマリ

| 観点 | 結果 | 実結果要約 |
| --- | --- | --- |
| ST-001 認証導線 | OK | 未認証 `/api/users/me` は 401、`/api/auth/login` 正常ログインは 200 |
| ST-001A Google ログイン導線 | OK | 実機確認で OAuth 開始から復帰後ログイン成立を確認 |
| ST-001B Google ログイン失敗 | 一部未達 | キャンセル後にログイン画面へ復帰し `/home` へ入れないことは確認。ただし失敗を明示する UI は未確認または未実装 |
| ST-002 新規オンボーディング | OK | `profiles` と `vehicles` が各 1 件ずつ作成された |
| ST-003 Home 連携 | OK | `/api/explore/routes/latest` が 200、最新ルート取得成立。実機確認で通知ドロワー表示と個別通知の `あなたへ` ラベルも確認 |
| ST-004 Health 音声診断 | OK | `/api/health/analyze-audio` が 200、`health_logs` 保存まで成立 |
| ST-005 Health 画像診断 | OK | 妥当な JPEG で `/api/health/analyze` が 200、対象未検出でも `health_logs` 保存成立 |
| ST-006 手動 ODO 更新 | OK | 負数は 400、正常値は 200、`vehicles.current_mileage=1500` を確認 |
| ST-007 Explore ルート生成 | OK | `/api/explore/routes` が 200、`routes` 作成成立 |
| ST-008 Explore ガイド | OK | 所有者の `/api/explore/routes/:id` が 200 |
| ST-008A Explore 権限制御 | OK | 他ユーザーの `/api/explore/routes/:id` が 403 |
| ST-009 Create 画像生成 | OK | `/api/create/generate` が 200、`creations` 作成成立。実画面と DB 確認の結果、変換後画像表示とダウンロード開始も仕様書通り |
| ST-010 Settings 更新 | OK | 有効な走行距離前提では `/api/users/me` PUT が 200、再取得値も一致 |
| ST-010A Settings 背景画像更新 | 一部確認 | 実機確認で背景画像変更後に Home 反映と再読込後の維持を確認。実装上は API/DB 保存ではなく `localStorage(home_bg_image)` |
| ST-011 オイル履歴自動反映 | OK | `maintenance_history` 1 件作成を確認 |
| ST-012A 問い合わせ連携成功 | OK | `/api/contact` が 201、`notion_sync_status='synced'` を確認。実画面確認でも送信完了 UI を含めて問題なし |
| ST-012B 問い合わせ連携失敗耐性 | 一部確認 | Notion を 401 失敗させても `/api/contact` は 201、`contact_messages` 保存と `notion_sync_status='failed'` を確認。送信結果 UI の実機確認は未実施 |
| ST-013A 認証/入力不備 | OK | ログイン 5 回目で 429、ODO 負数は 400、不正メール問い合わせは 400 |
| ST-013B 外部障害耐性 | 一部確認 | 画像診断に不正画像を送ると Gemini 側 `INVALID_ARGUMENT` で 500。画面確認は未実施 |
| ST-014 退会フロー | OK | `/api/users/me` DELETE が 200、`auth.users` / `profiles` / `vehicles` / `creations` 削除を確認 |

## 4. 詳細結果

### 4.1 OK
- ST-001
  - 未認証 `/api/users/me` は 401。
  - 新規作成ユーザーの `/api/auth/login` は 200。
- ST-001A
  - 実機確認で Google OAuth 開始からアプリ復帰後のログイン成立を確認。
- ST-001B
  - 実機確認で Google 認可をキャンセル後、ログイン画面へ復帰することを確認。
  - その後 `/home` へは入れず、ログイン画面へリダイレクトされることを確認。
  - 失敗を明示する UI 表示は未確認、または未実装のため仕様上は一部未達。
- ST-002
  - 使い捨てユーザー 2 件を作成し、`/api/users/onboarding` は双方 201。
  - `profiles` 2 件、`vehicles` 2 件の作成を確認。
- ST-003 / ST-007 / ST-008 / ST-008A
  - `time_limit_minutes=60`, `latitude=35.681236`, `longitude=139.767125` で `/api/explore/routes` は 200。
  - `routes` 作成と `/api/explore/routes/latest` 200 を確認。
  - 所有者の詳細取得は 200、別ユーザーでは 403。
  - 実機確認で Home の通知ドロワーにお知らせ一覧が表示されることを確認。
  - 個別通知 `【あなたへ】プレミアム特典のご案内` に `あなたへ` ラベルが表示されることを確認。
  - 全体通知には `あなたへ` ラベルが表示されないことを確認。
- ST-004
  - 簡易 WAV を送信し `/api/health/analyze-audio` は 200。
  - `health_logs.log_type='engine'` の保存を確認。
- ST-005
  - 512x512 JPEG を生成して `/api/health/analyze` を実行。
  - レスポンスは 200。`isTargetDetected=false` でも `health_logs` 保存と `media_url` 記録を確認。
- ST-006
  - `mileage=-1` は 400。
  - `mileage=1500` は 200。
  - `vehicles.current_mileage=1500` に更新。
- ST-009
  - `/api/create/generate` は 2 ユーザーで 200。
  - `creations` 作成を確認。
  - 実画面と DB 確認の結果、変換後画像の画面表示とダウンロード開始が仕様書通りであることを確認。
- ST-010 / ST-011
  - `current_mileage=1500` の前提で `/api/users/me` PUT は 200。
  - `display_name='updated-system-a'`, `maker='Suzuki'`, `model_name='GSX250R'`, `last_oil_change_mileage=1200` を確認。
  - `maintenance_history` は 1 件作成。
- ST-010A
  - 実機確認で Settings から背景画像を変更し、Home の背景へ反映されることを確認。
  - 再読込後も同一ブラウザで表示が維持されることを確認。
  - 実装上の保存先は backend / DB ではなく `localStorage.home_bg_image`。
  - 仕様書記載の「背景画像更新 API 成功」「保存先 URL または関連カラム更新」は現実装と不整合のため、仕様基準では一部確認。
- ST-012A
  - `/api/contact` は 201。
  - `contact_messages` 追加と `notion_sync_status='synced'` を確認。
  - 実画面確認で送信完了 UI を含めて仕様書通りに問題ないことを確認。
- ST-012B
  - 一時 backend を別ポートで起動し、`NOTION_TOKEN` を無効化して Notion 401 を再現。
  - `/api/contact` は 201 を返し、問い合わせ本体は保存継続。
  - `contact_messages` に `notion_sync_status='failed'` と `notion_sync_error` 記録を確認。
  - 送信結果をユーザーが判別できる画面表示の実機確認は未実施。
- ST-013A
  - 同一メール誤パスワード 5 回目で 429。
  - 不正メール問い合わせは 400。
- ST-014
  - 退会対象ユーザーで `/api/users/me` DELETE は 200。
  - `auth.users`, `profiles`, `vehicles`, `creations` の削除を確認。

### 4.2 NG と原因
- 初回の ST-010 / ST-011 は NG
  - 実施順で `current_mileage` 未更新のまま `last_oil_change_mileage=1200` を投入したため、バリデーションで 400。
  - 仕様の前提条件「前回交換距離は現在走行距離以下」を満たしていなかった。
  - `current_mileage=1500` 更新後に再実施し、正常系は OK。
- 初回の ST-005 は NG
  - 68 byte の極小 PNG を送信したところ、Gemini から `INVALID_ARGUMENT` が返り 500。
  - 妥当な JPEG に差し替えて再実施し、200 を確認。

## 5. 再テスト結果
- ST-010 / ST-011
  - 再テスト: PASS
  - 条件: `current_mileage=1500` 反映後に Settings 更新
- ST-005
  - 再テスト: PASS
  - 条件: 512x512 JPEG を使用

## 6. 未確認事項
- ST-013B のうち Notion 障害、ルーティング障害、Create 障害の画面確認
- ST-012B の送信結果 UI 実機確認

## 7. 残リスク
- ブラウザ UI の見た目、遷移、モバイル表示、権限ダイアログは今回未確認。
- Google OAuth と Notion 障害切替を含む外部依存の異常系は未完了。
- 画像診断の走行距離 OCR 反映は機能対象外として今回の評価対象から除外した。
- `ST-010A` は仕様書が API/DB 保存前提のままで、現実装の `localStorage` 保存と不整合がある。
