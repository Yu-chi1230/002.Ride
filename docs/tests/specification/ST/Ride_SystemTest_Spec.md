# ride システムテスト仕様書

## 1. 目的

`ride` の主要業務シナリオについて、画面、API、DB、外部連携をまたいだ一連の流れが、実運用に近い条件で成立することを確認する。

本仕様書では、以下を重点確認対象とする。
- 認証からオンボーディング完了までの利用開始フロー
- Health / Explore / Create / Settings / Contact の主要機能が通しで成立すること
- 保存データが再表示や後続機能に正しく反映されること
- 外部依存障害や入力不備時に破綻せず、適切に失敗を扱えること

対象実装:
- `frontend/pages/LoginPage.tsx`
- `frontend/pages/OnboardingPage.tsx`
- `frontend/pages/HomePage.tsx`
- `frontend/pages/HealthPage.tsx`
- `frontend/pages/ExplorePage.tsx`
- `frontend/pages/ExploreGuidePage.tsx`
- `frontend/pages/CreatePage.tsx`
- `frontend/pages/SettingPage.tsx`
- `frontend/pages/ContactPage.tsx`
- `backend/server.ts`

関連境界:
- Supabase Auth / Supabase Storage / Supabase Postgres
- Gemini 系 AI 解析
- ルーティングサービス
- 地図タイルサービス
- Notion API

## 2. テスト対象範囲

本仕様書で扱う範囲:
- メールログインと Google ログイン導線
- 新規登録からプロフィール・車両登録完了まで
- 認証状態に応じた画面遷移制御
- Home での最新ルート表示とお知らせ表示
- Health の音声診断、画像診断、手動 ODO 更新
- Explore のルート生成、ルート保存、ガイド表示
- Create の画像変換、生成結果保存、ダウンロード導線
- Settings のプロフィール更新、オイル管理更新、背景画像更新、退会
- Contact の問い合わせ保存と Notion 連携結果
- DB 更新結果の再取得と画面反映

本仕様書で扱わない範囲:
- AI モデル自体の判定精度
- 地図タイルの視覚品質や詳細デザイン差分
- 外部 SNS 投稿そのもの
- 負荷試験、脆弱性試験、長時間耐久試験
- 管理者専用の `/api/admin/announcements/sync` 実行オペレーション

## 3. 対象環境

### 3.1 実行環境

- フロントエンドコンテナ: `002ride-frontend-1`
- バックエンドコンテナ: `002ride-backend-1`
- データベースコンテナ: `002ride-supabase`
- フロントエンド URL: `http://localhost:5174`
- バックエンド URL: `http://localhost:8001`

### 3.2 必須設定

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `GEMINI_API_KEY`
- `GOOGLE_CLOUD_VISION_API_KEY`
- `NOTION_TOKEN`
- `NOTION_CONTACT_DATABASE_ID`
- `NOTION_ANNOUNCEMENT_DATABASE_ID`
- ルート生成に必要な地図・経路サービス設定値

### 3.3 実行端末条件

- モバイル想定のブラウザ確認を優先する
- 位置情報、マイク、画像アップロードを許可できる端末を用意する
- 画面サイズ差分確認用に PC ブラウザでも最低限の確認を行う

## 4. 前提データとアカウント条件

### 4.1 アカウント

- `ST-USER-01`: 新規登録確認用ユーザー
- `ST-USER-02`: 既存登録済みユーザー
- `ST-USER-03`: 退会確認専用ユーザー

### 4.2 車両データ

- 既存ユーザーには少なくとも 1 台の車両が紐づいていること
- オイル交換履歴あり/なしの両パターンを確認できること
- `current_mileage` と `last_oil_change_mileage` の大小関係が妥当なデータを準備すること

### 4.3 テスト用メディア

- エンジン音声ファイル 1 点以上
- タイヤ、チェーン、プラグの画像ファイル各 1 点以上
- Create 用画像ファイル 1 点以上
- ODO 更新検証用に現在走行距離より大きい値、小さい値、不正値を準備すること

### 4.4 DB 事前確認

- `profiles`
- `vehicles`
- `health_logs`
- `maintenance_settings`
- `maintenance_history`
- `routes`
- `waypoints`
- `cinematic_spots`
- `creations`
- `cinematic_details`
- `contact_messages`
- `announcements`

## 5. 外部連携と依存サービス

| 連携先 | 用途 | 主な確認内容 |
| --- | --- | --- |
| Supabase Auth | 認証/セッション | ログイン、サインアップ、退会後セッション破棄 |
| Supabase Storage | Health メディア保存 | 画像/音声アップロード後の保存失敗有無 |
| Supabase Postgres | 業務データ永続化 | API 実行結果が DB に反映されること |
| Gemini / Vision 系 AI | Health / Explore / Create | 成功時レスポンス反映、失敗時エラー処理 |
| ルーティングサービス | Explore 経路生成 | 経路取得成功/失敗時の API 応答 |
| 地図タイルサービス | Explore 画面表示 | 地図表示とガイド表示成立 |
| Notion API | 問い合わせ連携 / お知らせ同期元 | 問い合わせ時の同期成否記録 |

## 6. システムテスト観点一覧

| ID | 観点 | 概要 | 優先度 |
| --- | --- | --- | --- |
| ST-001 | 認証導線 | ログイン、未ログイン遷移制御、ログアウトが成立する | 高 |
| ST-001A | Google ログイン導線 | OAuth 開始から復帰後遷移まで成立する | 高 |
| ST-001B | Google ログイン失敗 | OAuth 認可拒否時にログイン画面へ復帰し失敗を判別できる | 中 |
| ST-002 | 新規利用開始 | オンボーディングで profile/vehicle が作成される | 高 |
| ST-003 | Home 連携 | 最新ルートとお知らせが表示される | 中 |
| ST-004 | Health 音声診断 | 音声アップロードから health_logs 保存まで成立する | 高 |
| ST-005 | Health 画像診断 | 画像診断結果の保存が成立する | 高 |
| ST-005A | Health 画像診断で走行距離反映 | 走行距離付き画像で current_mileage 反映が成立する | 中 |
| ST-006 | 手動 ODO 更新 | 走行距離更新とメンテナンス状態反映が成立する | 高 |
| ST-007 | Explore ルート生成 | ルート、waypoints、cinematic_spots 保存まで成立する | 高 |
| ST-008 | Explore ガイド | 保存済みルート詳細表示とガイド継続利用が成立する | 中 |
| ST-008A | Explore 権限制御 | 他ユーザー所有ルートの詳細参照を拒否する | 高 |
| ST-009 | Create 画像生成 | テーマ変換と creation/cinematic_details 保存が成立する | 高 |
| ST-010 | Settings 更新 | プロフィール・車両基本情報更新と再表示が一致する | 高 |
| ST-010A | Settings 背景画像更新 | 背景画像更新と再表示が一致する | 中 |
| ST-011 | オイル履歴自動反映 | オイル変更更新時に maintenance_history が整合する | 高 |
| ST-012A | 問い合わせ連携成功 | contact_messages 保存と Notion 同期成功記録が成立する | 中 |
| ST-012B | 問い合わせ連携失敗耐性 | Notion 失敗時も問い合わせ保存と失敗記録が成立する | 高 |
| ST-013A | 異常系 認証/入力不備 | 認証失敗と不正入力を適切に拒否する | 高 |
| ST-013B | 異常系 外部障害 | 外部依存障害時も画面と DB が破綻しない | 高 |
| ST-014 | 退会フロー | auth.users 起点で関連データが削除される | 高 |

## 7. 詳細テストケース

### ST-001 認証導線確認

- 対象シナリオ: 未ログイン状態からログインし、認証済みユーザーとして保護画面へ到達する
- 前提条件:
  - `ST-USER-02` が Supabase Auth に存在する
  - `profiles` と `vehicles` が作成済みである
- 実施手順:
  1. 未ログイン状態で `/home` に直接アクセスする
  2. ログイン画面へリダイレクトされることを確認する
  3. 正しいメールアドレスとパスワードでログインする
  4. `/home` へ遷移することを確認する
  5. Settings からログアウトする
- 期待結果:
  1. 未ログインでは保護画面に入れない
  2. ログイン成功後にセッションが確立する
  3. ログアウト後は再び `/` に戻り、保護画面へ直接入れない

### ST-001A Google ログイン導線確認

- 対象シナリオ: Google OAuth を開始し、認証復帰後に適切な画面へ遷移する
- 前提条件:
  - Google OAuth 設定が有効である
  - 既存プロフィールありユーザーと、プロフィール未作成ユーザーの両方を確認できる
- 実施手順:
  1. ログイン画面で `Google でログイン` を押下する
  2. Google 認証を完了する
  3. アプリへ復帰後の遷移先を確認する
- 期待結果:
  1. Google OAuth が開始される
  2. 認証済みかつプロフィール作成済みユーザーは `/home` へ遷移する
  3. 認証済みでプロフィール未作成ユーザーは `/onboarding` へ遷移する

### ST-001B Google ログイン失敗確認

- 対象シナリオ: Google OAuth をユーザーが拒否した場合でもログイン画面に復帰し失敗を判別できる
- 前提条件:
  - Google OAuth 設定が有効である
  - Google 認可画面でキャンセルまたは拒否操作を実行できる
- 実施手順:
  1. ログイン画面で `Google でログイン` を押下する
  2. Google 認可画面でキャンセルまたは拒否を行う
  3. アプリへ復帰後の画面表示を確認する
- 期待結果:
  1. 認証失敗後もログイン画面に留まる
  2. 認証失敗がユーザーに判別できる
  3. セッションは確立されない

### ST-002 新規オンボーディング

- 対象シナリオ: 新規ユーザーが会員登録と車両登録を完了する
- 前提条件:
  - 未使用メールアドレスを用意する
- 実施手順:
  1. `/onboarding` を開く
  2. Step1 で氏名、表示名、メール、パスワードを入力する
  3. Step2 でメーカー、車両名、規約同意を入力する
  4. 登録完了後に `/home` へ遷移する
  5. DB で `profiles` と `vehicles` を確認する
- 期待結果:
  1. Supabase Auth にユーザーが作成される
  2. `profiles.id = auth user id` で登録される
  3. `vehicles.user_id = profile id` の車両が 1 件作成される
  4. 再ログイン後も `/onboarding` へ戻されない

### ST-003 Home の最新ルート・お知らせ連携

- 対象シナリオ: Home に最新ルートとお知らせが表示される
- 前提条件:
  - 対象ユーザーに `routes` データが存在する
  - `announcements` テーブルに有効なお知らせが存在する
- 実施手順:
  1. ログイン後 `/home` を表示する
  2. 最新ルートカードの内容を確認する
  3. 通知ドロワーを開く
- 期待結果:
  1. `/api/explore/routes/latest` の結果がおすすめルートへ反映される
  2. お知らせ一覧が表示される
  3. 個別通知は `あなたへ` ラベルが出る

### ST-004 Health 音声診断

- 対象シナリオ: エンジン音を送信して診断結果を保存する
- 前提条件:
  - ログイン済みで車両が存在する
  - 音声ファイルを用意する
- 実施手順:
  1. `/health` で音声モードを選択する
  2. 録音またはテスト音声を用いて解析を実行する
  3. 結果表示を確認する
  4. DB の `health_logs` を確認する
- 期待結果:
  1. `/api/health/analyze-audio` が 200 を返す
  2. 解析結果の score / feedback が画面に表示される
  3. `health_logs.log_type='engine'` のレコードが作成される
  4. `media_url` に Supabase Storage 保存先が記録される

### ST-005 Health 画像診断

- 対象シナリオ: タイヤ等の画像診断を実行し結果を保存する
- 前提条件:
  - ログイン済みで車両が存在する
  - 対象部位の画像を用意する
- 実施手順:
  1. `/health` でカメラモードを選択する
  2. `tire` または `chain` を選択し画像をアップロードする
  3. 解析を実行する
  4. DB の `health_logs` を確認する
- 期待結果:
  1. `/api/health/analyze` が 200 を返す
  2. 解析結果が画面に表示される
  3. `health_logs.log_type` が選択した部位で保存される

### ST-005A Health 画像診断で走行距離反映

- 対象シナリオ: 走行距離が判読可能な画像診断で `current_mileage` が更新される
- 前提条件:
  - ログイン済みで車両が存在する
  - 数字が明瞭に写ったメーター画像を用意する
  - 更新前の `vehicles.current_mileage` を確認済みである
- 実施手順:
  1. `/health` でカメラモードを選択する
  2. メーター画像をアップロードして解析を実行する
  3. 解析結果を確認する
  4. DB の `vehicles` と `health_logs` を確認する
- 期待結果:
  1. `/api/health/analyze` が 200 を返す
  2. 解析結果に走行距離が表示される
  3. `vehicles.current_mileage` が画像の走行距離へ更新される
  4. `health_logs` に画像診断結果が保存される

### ST-006 手動 ODO 更新

- 対象シナリオ: 手動で ODO を更新し、車両情報へ反映する
- 前提条件:
  - ログイン済み
  - 現在走行距離より大きい正数を用意する
- 実施手順:
  1. `/health` で ODO モードを選択する
  2. 正常な走行距離を入力して保存する
  3. Settings を開き更新値を確認する
  4. DB の `vehicles` と `health_logs` を確認する
- 期待結果:
  1. `/api/health/mileage` が 200 を返す
  2. `vehicles.current_mileage` が更新される
  3. `health_logs` に手動更新ログが作成される
  4. オイル管理ステータスが最新走行距離基準で再計算される

### ST-007 Explore ルート生成

- 対象シナリオ: 現在地と制限時間から AI ルートを生成する
- 前提条件:
  - ログイン済み
  - 位置情報取得が可能
  - ルーティングサービスと AI サービスが利用可能
- 実施手順:
  1. `/explore` を開く
  2. 制限時間を設定して検索を実行する
  3. 生成ルート一覧と地図表示を確認する
  4. DB の `routes` `waypoints` `cinematic_spots` を確認する
- 期待結果:
  1. `/api/explore/routes` が 200 を返す
  2. 1 件以上のルート候補が表示される
  3. `routes` が作成される
  4. ルートごとに `waypoints` と `cinematic_spots` が保存される
  5. `best_photo_time` と `sun_angle_data` が保持される

### ST-008 Explore ガイド表示

- 対象シナリオ: 保存済みルートの詳細ガイドを参照する
- 前提条件:
  - `routes` `waypoints` `cinematic_spots` が存在する
- 実施手順:
  1. `/explore/guide/:routeId` を開く
  2. ルート線、撮影スポット、現在地追従を確認する
  3. 位置情報を移動またはモックして追従挙動を確認する
- 期待結果:
  1. `/api/explore/routes/:id` が 200 を返す
  2. ルート情報、撮影ガイド、スポットが表示される
  3. GPS 一時失敗時も画面が致命停止しない

### ST-008A Explore 他ユーザー所有ルート参照拒否

- 対象シナリオ: 他ユーザーが作成したルート詳細を参照できない
- 前提条件:
  - `ST-USER-02` とは別ユーザーが作成した `routeId` を用意する
- 実施手順:
  1. `ST-USER-02` でログインする
  2. 他ユーザー所有の `/explore/guide/:routeId` にアクセスする
  3. API 応答と画面挙動を確認する
- 期待結果:
  1. `/api/explore/routes/:id` が 403 を返す
  2. 他ユーザーのルート詳細は表示されない
  3. 画面が致命停止せず、失敗が判別できる

### ST-009 Create 画像生成

- 対象シナリオ: 画像にテーマを適用して保存可能な状態にする
- 前提条件:
  - ログイン済み
  - 画像ファイルを用意する
- 実施手順:
  1. `/create` に画像をアップロードする
  2. テーマと強度を変更する
  3. 自動生成結果を確認する
  4. ダウンロード操作を行う
  5. DB の `creations` と `cinematic_details` を確認する
- 期待結果:
  1. `/api/create/generate` が 200 を返す
  2. 変換後画像が画面に表示される
  3. `creations` が作成される
  4. `cinematic_details.color_logic_memo` が保存される
  5. 保存操作で画像ダウンロードが開始される

### ST-010 Settings プロフィール更新

- 対象シナリオ: ユーザー名と車両基本情報を更新する
- 前提条件:
  - ログイン済み
- 実施手順:
  1. `/settings` を開く
  2. プロフィール編集を有効化して表示名、氏名、メーカー、車種を変更する
  3. 保存後に画面再読込する
  4. DB の `profiles` と `vehicles` を確認する
- 期待結果:
  1. `/api/users/me` が 200 を返す
  2. 再読込後も更新値が表示される
  3. `profiles` と `vehicles` の対象カラムが更新される

### ST-010A Settings 背景画像更新

- 対象シナリオ: Settings で背景画像を更新し、再表示後も反映される
- 前提条件:
  - ログイン済み
  - 背景画像に利用できる画像ファイルを用意する
- 実施手順:
  1. `/settings` を開く
  2. 背景画像変更 UI から画像を選択して保存する
  3. 画面再読込後の表示を確認する
  4. 必要に応じて DB または保存先 URL を確認する
- 期待結果:
  1. 背景画像更新 API が成功する
  2. 保存直後に新しい背景画像が表示される
  3. 再読込後も同じ背景画像が表示される
  4. 保存先 URL または関連カラムが更新される

### ST-011 Settings オイル管理更新

- 対象シナリオ: オイル交換情報と交換サイクルを更新する
- 前提条件:
  - ログイン済み
  - 現在走行距離以上にならない妥当な前回交換距離を用意する
- 実施手順:
  1. `/settings` で前回オイル交換日、交換時走行距離、月間平均走行距離、交換サイクルを入力する
  2. 保存する
  3. DB の `vehicles` `maintenance_settings` `maintenance_history` を確認する
- 期待結果:
  1. `vehicles.last_oil_change_*` が更新される
  2. `maintenance_settings` の oil 設定が追加または更新される
  3. 変更差分がある場合は `maintenance_history` に記録される
  4. 画面のオイル管理ステータスが更新される

### ST-012A Contact 問い合わせ登録成功

- 対象シナリオ: 問い合わせを登録し、内部 DB と Notion 連携状態を記録する
- 前提条件:
  - ログイン済み
  - `NOTION_TOKEN` と関連 Notion 設定が有効である
- 実施手順:
  1. `/settings/contact` を開く
  2. 正常な入力で送信する
  3. 成功メッセージを確認する
  4. DB の `contact_messages` を確認する
  5. Notion 側または `notion_sync_status` を確認する
- 期待結果:
  1. `/api/contact` が 201 を返す
  2. `contact_messages` にレコードが作成される
  3. `notion_sync_status='synced'` が記録される
  4. Notion 側にも問い合わせが反映される

### ST-012B Contact 問い合わせ登録で Notion 失敗

- 対象シナリオ: Notion 連携失敗時も問い合わせ本体は保存される
- 前提条件:
  - ログイン済み
  - `NOTION_TOKEN` 無効化などで Notion 連携失敗を再現できる
- 実施手順:
  1. Notion 連携が失敗する設定に切り替える
  2. `/settings/contact` を開く
  3. 正常な入力で送信する
  4. API 応答と画面表示を確認する
  5. DB の `contact_messages` を確認する
- 期待結果:
  1. `/api/contact` は問い合わせ保存成功として応答する
  2. `contact_messages` にレコードが作成される
  3. `notion_sync_status='failed'` と失敗理由が記録される
  4. 画面が致命停止せず、送信結果を判別できる

### ST-013A 異常系 認証と入力不備

- 対象シナリオ: 認証失敗や不正入力を適切に拒否する
- 前提条件:
  - 認証失敗と入力不備を再現できるテストデータを用意する
- 実施手順:
  1. ログインで誤パスワードを連続投入する
  2. Health ODO に負数を入れる
  3. Settings のオイル交換距離に現在走行距離超過値を入れる
  4. Contact に不正メール形式や超過文字数を入れる
- 期待結果:
  1. ログイン試行回数超過時は 429 と再試行案内になる
  2. 不正入力は 400 系で拒否される
  3. 画面がクラッシュせず、ユーザーに失敗が分かる
  4. 不正入力は DB に保存されない

### ST-013B 異常系 外部依存障害

- 対象シナリオ: 外部依存障害時も画面と DB が破綻しない
- 前提条件:
  - テスト環境で Notion / AI / ルーティング依存を停止または失敗させられる
- 実施手順:
  1. Notion 連携を失敗させた状態で Contact を送信する
  2. AI 解析を失敗させた状態で Health または Create を実行する
  3. ルーティング依存を失敗させた状態で Explore ルート生成を実行する
  4. API 応答、画面表示、DB 更新有無を確認する
- 期待結果:
  1. 各機能が失敗をユーザーに判別できる形で返す
  2. 画面がクラッシュしない
  3. 部分保存が許容されない機能では DB 整合性が保たれる
  4. 失敗理由または同期状態が追跡できる

### ST-014 退会フロー

- 対象シナリオ: 退会で関連データが削除される
- 前提条件:
  - `ST-USER-03` に profile / vehicle / health / route / create の一部データを持たせる
- 実施手順:
  1. Settings から退会を実行する
  2. ログイン画面へ戻ることを確認する
  3. DB で `auth.users` と関連テーブルを確認する
- 期待結果:
  1. `/api/users/me` DELETE が 200 を返す
  2. 対象ユーザーの `auth.users` が削除される
  3. `profiles` `vehicles` `routes` `waypoints` `cinematic_spots` `creations` など、外部キーで連動する関連データが削除される
  4. 退会後セッションでは保護画面へ入れない

## 8. 実施順序

1. ST-001 認証導線確認
2. ST-001A Google ログイン導線確認
3. ST-001B Google ログイン失敗確認
4. ST-002 新規オンボーディング
5. ST-010 Settings プロフィール更新
6. ST-010A Settings 背景画像更新
7. ST-011 Settings オイル管理更新
8. ST-004 Health 音声診断
9. ST-005 Health 画像診断
10. ST-005A Health 画像診断で走行距離反映
11. ST-006 手動 ODO 更新
12. ST-007 Explore ルート生成
13. ST-003 Home の最新ルート・お知らせ連携
14. ST-008 Explore ガイド表示
15. ST-008A Explore 他ユーザー所有ルート参照拒否
16. ST-009 Create 画像生成
17. ST-012A Contact 問い合わせ登録成功
18. ST-012B Contact 問い合わせ登録で Notion 失敗
19. ST-013A 異常系 認証と入力不備
20. ST-013B 異常系 外部依存障害
21. ST-014 退会フロー

## 9. 未確認事項と残リスク

- Google OAuth の本番リダイレクト設定は環境依存のため、別途実環境で確認が必要
- AI 解析結果の妥当性は本仕様書では対象外であり、判定精度保証にはならない
- ルーティングサービスや地図タイルの外部制限により、時間帯やネットワーク状態で再現性がぶれる可能性がある
- Notion 連携の成否はトークン権限や DB スキーマ差分に依存する
- `HealthPage` は認証ガード配下ではないため、未ログイン時の扱いは実装と運用意図の差分確認が必要
- `contact_messages` は退会時 cascade 対象ではないため、問い合わせ履歴の削除要否は別途運用設計が必要
