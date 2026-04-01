# ride 結合テスト仕様書

## 1. 目的

`ride` の主要機能について、画面、認証、API、DB、Notion、Supabase Storage/Query の連携が破綻せず成立することを確認する。

単体テストでは担保しきれない以下を重点確認対象とする。

- 画面操作から API 呼び出しまでの一連の流れ
- API 実行結果が DB 更新や再取得データへ正しく反映されること
- 認証有無や入力不正時に、連携先を含めた異常系が適切に扱われること
- 外部依存がある機能で、モック許容境界と実接続必須境界が明確であること

対象実装:

- `frontend/src/App.tsx`
- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/lib/api.ts`
- `frontend/pages/LoginPage.tsx`
- `frontend/pages/HomePage.tsx`
- `frontend/pages/HealthPage.tsx`
- `frontend/pages/ExplorePage.tsx`
- `frontend/pages/CreatePage.tsx`
- `frontend/pages/SettingPage.tsx`
- `frontend/pages/ContactPage.tsx`
- `backend/server.ts`
- `backend/src/auth/loginHandler.ts`
- `backend/src/explore/latestRouteHandler.ts`
- `backend/src/explore/routeDetailsHandler.ts`
- `backend/src/health/mileageHandler.ts`
- `backend/src/create/generateHandler.ts`
- `backend/src/settings/maintenance.ts`

## 2. テスト対象連携範囲

本仕様書で扱う連携:

- ログイン画面 -> `/api/auth/login` -> Supabase Auth -> セッション保持 -> `/api/users/me`
- `AuthContext` -> `/api/users/me` -> `profiles` / `vehicles` / `maintenance_settings`
- Home 画面 -> `/api/explore/routes/latest` -> `routes`
- Home 画面 -> Supabase `announcements` 参照
- Health 画面 手動 ODO 更新 -> `/api/health/mileage` -> `vehicles.current_mileage` / `health_logs` / `oil_maintenance_status` 再計算結果
- Health 画面 画像・音声診断 -> `/api/health/analyze*` -> 解析結果表示
- Explore 画面 ルート検索 -> `/api/explore/routes` -> `routes` / `waypoints` / `cinematic_spots`
- Explore 画面 詳細遷移 -> `/api/explore/routes/:id` -> 所有者チェック付き詳細取得
- Create 画面 -> `/api/create/generate` -> 画像変換 -> `creations` 系記録
- Settings 画面 -> `/api/users/me` 更新 -> `profiles` / `vehicles` / `maintenance_settings` / `maintenance_history`
- Contact 画面 -> `/api/contact` -> `contact_messages` -> Notion ページ作成
- 管理者同期 API -> `/api/admin/announcements/sync` -> Notion DB -> `announcements`

本仕様書で扱わない連携:

- AI 解析精度そのものの妥当性
- MapLibre の描画品質や地図タイル配信品質
- 画像加工アルゴリズム自体の画質評価
- Supabase / Notion / Gemini / ルーティングサービスの障害耐性試験
- ネットワーク帯域や高負荷時の性能試験
- 実機ブラウザ差異、UI の見た目崩れ、アクセシビリティ詳細試験

## 3. 前提条件

- frontend コンテナ `002ride-frontend-1`、backend コンテナ `002ride-backend-1`、DB/ Supabase コンテナ `002ride-supabase` が起動していること
- backend は `8001` 番ポートで待ち受け、frontend から `VITE_API_URL` 経由で到達できること
- Supabase Auth、DB、Storage が利用可能であること
- Notion 連携を実接続確認するケースでは `NOTION_TOKEN`、対象 DB ID が設定されていること
- 認証付き API は有効な JWT を付与して呼び出せること
- DB の初期スキーマは [docs/DB/Database_Definition.md](/Users/yusn/Documents/10.AiDev/002.Ride/docs/DB/Database_Definition.md) と整合していること

## 4. テストデータ準備方針

- テストユーザーを少なくとも 2 件用意する
- `user-a`: 正常系の主担当ユーザー
- `user-b`: 他ユーザー参照禁止、権限制御確認用
- `user-a` には `profiles`、`vehicles`、`maintenance_settings`、`routes`、`waypoints`、`cinematic_spots` の関連データを用意する
- `user-b` にも `routes` を 1 件用意し、`user-a` が参照すると 403 になるデータを準備する
- `announcements` はグローバル通知と個別通知を各 1 件以上用意する
- `contact_messages` はテストごとに新規採番される前提とし、既存データと衝突しない件名を使う
- `maintenance_settings` のオイル交換サイクルは、残距離が正数になるケースと超過になるケースを用意する
- `health_logs` は手動 ODO 更新前後の比較ができる状態にしておく
- Create 機能用に 1 枚以上の JPEG/PNG テスト画像を準備する
- Health 画像診断用にタイヤまたはチェーン画像を準備する
- Health 音声診断用に 5 秒程度の録音サンプルを準備する

## 5. モック方針と実接続方針

### 5.1 実接続が必要な境界

- `profiles`、`vehicles`、`maintenance_settings`、`maintenance_history`、`health_logs`、`routes`、`waypoints`、`cinematic_spots`、`creations`、`contact_messages`、`announcements` への DB 反映
- Supabase Auth によるログインと JWT 検証
- Home 画面での Supabase `announcements` 参照
- Settings 更新後の `/api/users/me` 再取得結果

### 5.2 モック許容境界

- Health の AI 音声解析、画像解析の内容自体
- Explore の経路生成アルゴリズム内部
- Create の画像スタイル変換アルゴリズム内部
- MapLibre の地図描画

基本方針:

- DB 反映確認を主目的とするケースでは AI 応答だけモックし、API と DB は実接続で通す
- Notion 連携は 2 段階で扱う
- 第1段階: Notion API をモックし、`contact_messages` と `announcements` の状態遷移を確認する
- 第2段階: 実接続で Notion 側ページ作成または同期成功を確認する
- ルート生成が外部依存に強く引っ張られる場合は `/api/explore/routes/latest`、`/api/explore/routes/:id` を優先して実接続確認し、生成 API はモック込み結合でも許容する

## 6. テストシナリオ一覧

| ID | シナリオ | 連携範囲 | 区分 |
| --- | --- | --- | --- |
| IT-001 | ログイン成功後にプロフィールが取得され Home へ遷移できる | LoginPage -> `/api/auth/login` -> Supabase Auth -> `/api/users/me` | 正常系 |
| IT-002 | ログイン失敗時にロック状態を含むエラーが UI に反映される | LoginPage -> `/api/auth/login` -> `login_attempts` | 異常系 |
| IT-003 | Home 画面で最新ルートとお知らせが取得できる | HomePage -> `/api/explore/routes/latest` -> `routes`、Supabase `announcements` | 正常系 |
| IT-004 | Health 手動 ODO 更新で DB とメンテ状態が更新される | HealthPage -> `/api/health/mileage` -> `vehicles` / `health_logs` / `oil_maintenance_status` 再計算結果 | 正常系 |
| IT-005 | Health 手動 ODO 更新で前回オイル交換距離未満を拒否する | HealthPage -> `/api/health/mileage` | 異常系 |
| IT-006 | Health 画像診断で結果が画面表示される | HealthPage -> `/api/health/analyze` | 正常系 |
| IT-007 | Health 音声診断で結果が画面表示される | HealthPage -> `/api/health/analyze-audio` | 正常系 |
| IT-008 | Home から最新ルートを Explore へ引き継いで表示できる | HomePage -> `/api/explore/routes/latest` -> `/explore` state 引き継ぎ | 正常系 |
| IT-009 | Explore ルート生成で routes / waypoints / cinematic_spots が作成される | ExplorePage -> `/api/explore/routes` -> `routes` / `waypoints` / `cinematic_spots` | 正常系 |
| IT-010 | Explore ルート生成で外部依存エラー時に部分保存有無を確認して失敗応答となる | ExplorePage -> `/api/explore/routes` | 異常系 |
| IT-011 | Explore 詳細取得で他ユーザーのルート参照を拒否する | `/api/explore/routes/:id` -> `routes` / `waypoints` / `cinematic_spots` | 異常系 |
| IT-012 | Create 画像加工で加工結果と制作物記録が返る | CreatePage -> `/api/create/generate` -> `creations` / `cinematic_details` | 正常系 |
| IT-013 | Settings プロフィール更新で `/api/users/me` 再取得結果へ反映される | SettingPage -> `/api/users/me` -> `profiles` / `vehicles` | 正常系 |
| IT-014 | Settings オイル管理更新で設定と履歴が同期される | SettingPage -> `/api/users/me` -> `maintenance_settings` / `maintenance_history` | 正常系 |
| IT-015 | Settings で現在走行距離より大きい前回オイル交換距離を拒否する | SettingPage -> `/api/users/me` | 異常系 |
| IT-016 | Contact 送信で内部 DB 保存と Notion 連携状態が更新される | ContactPage -> `/api/contact` -> `contact_messages` -> Notion | 正常系 |
| IT-017 | Contact 送信で Notion 失敗時も内部記録を保持する | ContactPage -> `/api/contact` -> `contact_messages` -> Notion | 異常系 |
| IT-018 | 管理者がお知らせ同期 API を実行すると Notion 内容が DB に反映される | `/api/admin/announcements/sync` -> Notion -> `announcements` | 正常系 |

## 7. 詳細テストケース

### IT-001 ログイン成功後にプロフィールが取得され Home へ遷移できる

- テスト観点: 認証成功後のセッション連携とプロフィール取得
- 前提データ:
  1. `user-a` が Supabase Auth に存在する
  2. `profiles` と `vehicles` が `user-a` に紐づいて存在する
- 実施手順:
  1. `LoginPage` で `user-a` のメールアドレスとパスワードを入力する
  2. ログイン送信を実行する
  3. `AuthContext` の `/api/users/me` 呼び出し完了を待つ
- 期待結果:
  1. `/api/auth/login` が 200 を返す
  2. レスポンス内のセッション情報がフロントに保持される
  3. `/api/users/me` が 200 を返し、`hasProfile: true` を返す
  4. Home 画面へ遷移する
  5. Home 上でプロフィール依存 UI が異常なく描画される

### IT-002 ログイン失敗時にロック状態を含むエラーが UI に反映される

- テスト観点: 認証失敗時の API 応答と UI メッセージ連携
- 前提データ:
  1. `login_attempts` が初期化済み、またはロック状態を作れること
- 実施手順:
  1. 存在するメールアドレスに対して誤ったパスワードでログインする
  2. 必要に応じて連続失敗させてロック状態を作る
- 期待結果:
  1. 誤パスワード時は 401 または 429 を返す
  2. 429 時は再試行待機に関するメッセージが UI に表示される
  3. Home 画面へ遷移しない
  4. `login_attempts` の失敗回数または `locked_until` が更新される

### IT-003 Home 画面で最新ルートとお知らせが取得できる

- テスト観点: Home 画面の API 取得と Supabase クエリの並行連携
- 前提データ:
  1. `user-a` に最新ルートが 1 件以上存在する
  2. 表示対象の `announcements` が存在する
- 実施手順:
  1. `user-a` でログイン済み状態を作る
  2. Home 画面を表示する
- 期待結果:
  1. `/api/explore/routes/latest` が 200 を返す
  2. 最新ルート情報がおすすめルートに表示される
  3. Supabase の `announcements` 取得が成功する
  4. お知らせドロワーに DB 登録済みのお知らせが表示される

### IT-004 Health 手動 ODO 更新で DB とメンテ状態が更新される

- テスト観点: 手動 ODO 更新の API、DB、再計算済みメンテ状態の整合
- 前提データ:
  1. `user-a` の `vehicles.current_mileage` が既知値である
  2. `maintenance_settings` にオイル交換サイクルが設定されている
- 実施手順:
  1. Health 画面の `手動ODO` モードを開く
  2. 現在値より大きい走行距離を入力して更新する
  3. API 応答後に画面表示と DB を確認する
- 期待結果:
  1. `/api/health/mileage` が 200 を返す
  2. `vehicles.current_mileage` が入力値で更新される
  3. `health_logs` に手動更新ログが 1 件追加される
  4. `maintenance_settings` 自体は更新せず、レスポンスの `vehicle.oil_maintenance_status` が再計算結果として返る
  5. 画面に更新後走行距離とメンテ状況が表示される

### IT-005 Health 手動 ODO 更新で前回オイル交換距離未満を拒否する

- テスト観点: 手動 ODO 更新の業務制約
- 前提データ:
  1. `vehicles.last_oil_change_mileage` が設定済みである
- 実施手順:
  1. Health 画面で `last_oil_change_mileage` 未満の値を入力して更新する
- 期待結果:
  1. `/api/health/mileage` が 400 を返す
  2. エラー文言が UI に表示される
  3. `vehicles.current_mileage` は更新されない
  4. `health_logs` に新規レコードは作成されない

### IT-006 Health 画像診断で結果が画面表示される

- テスト観点: 画像アップロードと診断レスポンス表示
- 前提条件:
  1. `/api/health/analyze` は利用可能である
  2. 解析内容はモックでもよい
- 実施手順:
  1. `目視点検` モードを開く
  2. 点検対象を選び画像をアップロードする
  3. 解析を実行する
- 期待結果:
  1. 画像と `log_type` を含む `FormData` が送信される
  2. 200 応答時にスコア、所見、ODO などの結果が表示される
  3. 異常応答時は失敗メッセージが表示される

### IT-007 Health 音声診断で結果が画面表示される

- テスト観点: 録音から音声診断 API 呼び出しまでの連携
- 前提条件:
  1. ブラウザ権限または録音モックが用意されている
  2. `/api/health/analyze-audio` は利用可能である
- 実施手順:
  1. `エンジン診断` モードで録音する
  2. 録音後に診断を実行する
- 期待結果:
  1. 録音データが `engine_sound.webm` として送信される
  2. 200 応答時に健康度スコアとフィードバックが表示される
  3. 失敗時は画面上でエラーを認識できる

### IT-008 Home から最新ルートを Explore へ引き継いで表示できる

- テスト観点: Home から Explore への state 引き継ぎと latest route 単体項目の表示
- 前提データ:
  1. `user-a` の最新ルートが 1 件存在する
- 実施手順:
  1. Home 画面でおすすめルートカードを押下する
  2. `/explore` へ遷移した画面で引き継ぎ済みルートの表示を確認する
- 期待結果:
  1. Home では `/api/explore/routes/latest` の取得結果がカード表示に使われる
  2. カード押下時に `/explore` へ `predefinedRoute` が引き継がれる
  3. Explore 側で引き継いだルート情報を使って、少なくともタイトルと距離が表示される
  4. `waypoints` と `cinematic_spots` は latest route API の返却対象外であるため、この導線単独では表示必須としない
  5. この導線では `/api/explore/routes/:id` 呼び出しを必須としない

### IT-009 Explore ルート生成で routes / waypoints / cinematic_spots が作成される

- テスト観点: ルート生成時の複数テーブル登録
- 前提データ:
  1. `user-a` が認証済みである
  2. `vehicles` に `user-a` の車両が存在する
  3. 外部のスポット提案や道路ルーティング依存は結合テストで許容する方法に切り替え可能である
- 実施手順:
  1. Explore 画面で現在地取得後、時間条件を指定してルート生成を実行する
  2. API 応答後に DB を確認する
- 期待結果:
  1. `/api/explore/routes` が 200 を返す
  2. `routes` に `user_id`、`vehicle_id`、`time_limit_minutes` を持つ新規レコードが作成される
  3. 生成された各ルートに対応する `waypoints` が作成される
  4. 生成された各ルートに対応する `cinematic_spots` が作成される
  5. 画面に候補ルート一覧または選択中ルート情報が表示される

### IT-010 Explore ルート生成で外部依存エラー時に部分保存有無を確認して失敗応答となる

- テスト観点: ルート生成失敗時の失敗応答と部分保存有無の確認
- 前提条件:
  1. スポット提案または道路ルーティング依存で失敗を再現できる
- 実施手順:
  1. Explore 画面からルート生成を実行し、外部依存エラーを発生させる
  2. API 応答と DB を確認する
- 期待結果:
  1. `/api/explore/routes` が 500 を返す
  2. 画面側では成功結果を表示しない
  3. エラー発生前に保存済みの候補が存在しないかを `routes`、`waypoints`、`cinematic_spots` で確認する
  4. 現行実装は候補ごとのトランザクションで保存するため、全件未反映は保証せず、部分保存の有無を記録する

### IT-011 Explore 詳細取得で他ユーザーのルート参照を拒否する

- テスト観点: 所有者チェック付き詳細取得
- 前提データ:
  1. `user-b` 所有ルートが存在する
- 実施手順:
  1. `user-a` のトークンで `user-b` 所有ルート ID を指定して `/api/explore/routes/:id` を呼ぶ
- 期待結果:
  1. API は 403 を返す
  2. 他ユーザーの `route`、`waypoints`、`cinematic_spots` は返らない

### IT-012 Create 画像加工で加工結果と制作物記録が返る

- テスト観点: 画像加工 API と `creations` 記録
- 前提条件:
  1. 画像加工入力ファイルがある
  2. テーマ ID は有効値を使用する
- 実施手順:
  1. Create 画面で画像を選択する
  2. テーマと強度を選び加工を実行する
- 期待結果:
  1. `/api/create/generate` が 200 を返す
  2. レスポンスに `creation_id`、`theme`、`intensity`、`processed_images` が含まれる
  3. 加工後画像が画面に反映される
  4. `creations` に対応レコードが作成される
  5. `cinematic_details` に `creation_id` と `color_logic_memo` を持つレコードが作成される

### IT-013 Settings プロフィール更新で `/api/users/me` 再取得結果へ反映される

- テスト観点: プロフィール編集と再取得の整合
- 前提データ:
  1. `user-a` の `profiles` と `vehicles` が存在する
- 実施手順:
  1. Settings 画面で氏名、表示名、車種情報を更新する
  2. 保存後に `refreshProfile()` を通じて再取得する
- 期待結果:
  1. `/api/users/me` PUT が 200 を返す
  2. `profiles` の氏名・表示名が更新される
  3. `vehicles` の `maker`、`model_name` が更新される
  4. 再取得結果が UI に反映される

### IT-014 Settings オイル管理更新で設定と履歴が同期される

- テスト観点: メンテ設定更新時の複数テーブル整合
- 前提データ:
  1. 対象車両に `maintenance_settings` が存在する、または新規作成可能である
- 実施手順:
  1. 前回オイル交換日、前回オイル交換時距離、月間平均走行距離、交換サイクルを更新する
  2. 保存後に DB を確認する
- 期待結果:
  1. `vehicles.last_oil_change_mileage`、`last_oil_change_date`、`monthly_avg_mileage` が更新される
  2. `maintenance_settings` のオイル項目が更新または作成される
  3. オイル交換状態が変化した場合、`maintenance_history` に手動登録由来の履歴が再作成される
  4. 交換サイクルが変更された場合、差分メモ付き履歴が追加される
  5. 再取得した `oil_maintenance_status` が画面に反映される

### IT-015 Settings で現在走行距離より大きい前回オイル交換距離を拒否する

- テスト観点: Settings 更新時の業務バリデーション
- 前提データ:
  1. `vehicles.current_mileage` が設定済みである
- 実施手順:
  1. `current_mileage` より大きい `last_oil_change_mileage` を入力して保存する
- 期待結果:
  1. `/api/users/me` PUT が 400 を返す
  2. エラー文言が UI に表示される
  3. `vehicles`、`maintenance_settings`、`maintenance_history` は更新されない

### IT-016 Contact 送信で内部 DB 保存と Notion 連携状態が更新される

- テスト観点: 問い合わせ送信時の DB 保存と Notion 同期
- 前提条件:
  1. `NOTION_TOKEN` と問い合わせ用 DB ID が設定済み、または Notion API をモックする
- 実施手順:
  1. Contact 画面で必須項目を入力し送信する
  2. `contact_messages` と Notion 応答を確認する
- 期待結果:
  1. `/api/contact` が 201 を返す
  2. `contact_messages` に本文とメタデータが記録される
  3. Notion には要約付きでページ作成リクエストが送られる
  4. Notion 成功時は `notion_sync_status='synced'` になる
  5. UI に送信成功モーダルが表示される

### IT-017 Contact 送信で Notion 失敗時も内部記録を保持する

- テスト観点: 外部連携失敗時のフォールバック
- 前提条件:
  1. Notion API を失敗させる、または `NOTION_TOKEN` 未設定状態を作る
- 実施手順:
  1. Contact を送信する
- 期待結果:
  1. `contact_messages` には問い合わせレコードが残る
  2. `notion_sync_status='failed'` とエラー内容が保存される
  3. API 応答は 201 を返し、レスポンスの `notionSyncStatus` は `failed` になる
  4. UI は送信成功として扱い、内部フォールバック失敗は DB とレスポンス値で確認する

### IT-018 管理者がお知らせ同期 API を実行すると Notion 内容が DB に反映される

- テスト観点: 管理者 API、Notion、DB の同期整合
- 前提条件:
  1. 管理者ユーザーで認証済みである
  2. Notion 側に公開状態のお知らせページが存在する
- 実施手順:
  1. `/api/admin/announcements/sync` を管理者トークン付きで実行する
  2. `announcements` を確認する
- 期待結果:
  1. API が 200 を返す
  2. 公開中のお知らせが `announcements` に upsert される
  3. Notion から消えた、または非公開になった既存お知らせは `end_date` が現在時刻に更新される
  4. `syncedCount` と `disabledCount` が実データ件数と整合する

## 8. 未確認事項と残リスク

- `/api/health/analyze`、`/api/health/analyze-audio`、`/api/explore/routes` の実装詳細は本確認範囲では一部省略しており、外部 AI/経路依存が強いケースはモック込み結合で補う前提がある
- Home 画面のお知らせ取得は backend API ではなく Supabase クライアント直接参照のため、RLS 設定差異の影響を受ける
- Contact と Announcement Sync は Notion のデータベースプロパティ名に依存するため、Notion 側スキーマ変更に弱い
- Explore ルート生成は候補単位で保存処理を行うため、外部依存エラー時に部分保存が起こりうる
- Create 機能は `creations` 作成までが主確認対象であり、`cinematic_details`、`media_edits`、`social_assets` までの保存連携は現実装上未接続の可能性がある
- 実行環境上、録音、位置情報、MapLibre はブラウザ機能制約を受けるため、自動テストだけでなく手動確認を前提にする

## 9. 実施時の確認順

1. 認証連携: `IT-001`、`IT-002`
2. Home / Explore 参照系: `IT-003`、`IT-008`、`IT-011`
3. Explore 生成系: `IT-009`、`IT-010`
4. Health 更新系: `IT-004`、`IT-005`、`IT-006`、`IT-007`
5. Create / Settings 更新系: `IT-012`、`IT-013`、`IT-014`、`IT-015`
6. 外部連携: `IT-016`、`IT-017`、`IT-018`
