# ride 結合テスト結果

## テストシナリオ

- IT-001 ログイン成功後にプロフィールが取得され Home へ遷移できる
- IT-002 ログイン失敗時にロック状態を含むエラーが UI に反映される
- IT-003 Home 画面で最新ルートとお知らせが取得できる
- IT-004 Health 手動 ODO 更新で DB とメンテ状態が更新される
- IT-005 Health 手動 ODO 更新で前回オイル交換距離未満を拒否する
- IT-006 Health 画像診断で結果が画面表示される
- IT-007 Health 音声診断で結果が画面表示される
- IT-008 Home から最新ルートを Explore へ引き継いで表示できる
- IT-009 Explore ルート生成で routes / waypoints / cinematic_spots が作成される
- IT-010 Explore ルート生成で外部依存エラー時に部分保存有無を確認して失敗応答となる
- IT-011 Explore 詳細取得で他ユーザーのルート参照を拒否する
- IT-012 Create 画像加工で加工結果と制作物記録が返る
- IT-013 Settings プロフィール更新で `/api/users/me` 再取得結果へ反映される
- IT-014 Settings オイル管理更新で設定と履歴が同期される
- IT-015 Settings で現在走行距離より大きい前回オイル交換距離を拒否する
- IT-016 Contact 送信で内部 DB 保存と Notion 連携状態が更新される
- IT-017 Contact 送信で Notion 失敗時も内部記録を保持する
- IT-018 管理者がお知らせ同期 API を実行すると Notion 内容が DB に反映される

## シナリオごとの実施結果

- 実施日時: 2026-03-30（JST）
- 追試日時: 2026-04-01（JST）
- 基準仕様書: `docs/tests/specification/IT/IntegrationTest_Spec.md`
- 実施環境:
    - backend: `002ride-backend-1`
    - 追試用 backend: `002ride-backend-it17`（`IT-017` のみ、`NOTION_TOKEN` 無効化）
    - DB: `002ride-SDB`
    - Auth: `http://localhost:8082/auth/v1`
- 実施方法:
    - Supabase Auth で一時ユーザー `user-a` / `user-b` を作成
    - backend API を `curl` で実行
    - DB を `docker exec 002ride-SDB psql ...` で照合
    - 実施後、一時ユーザーと `login_attempts` は削除

### IT-001

- 実施結果: OK
- 確認内容:
    - `/api/auth/login` で `user-a` が成功
    - `/api/users/onboarding` で `profiles` / `vehicles` 作成成功
    - `/api/users/me` が `hasProfile: true` を返却
- 根拠:
    - `userA.id` と `loginUser` が一致
    - `meA.data.vehicles[0].maker = Honda`

### IT-002

- 実施結果: OK
- 確認内容:
    - 誤パスワードで `/api/auth/login` が `401`
    - `login_attempts` に失敗回数が記録
- 根拠:
    - API: `401`
    - DB: `it_user_a_20260330_exec4@example.com|1|f`

### IT-003

- 実施結果: OK
- 確認内容:
    - 2026-03-30: `user-a` 用に投入した route を `/api/explore/routes/latest` で取得
    - 2026-04-01: 認証済み JWT で Supabase `announcements` を直接参照し、有効なお知らせを取得
- 根拠:
    - `/api/explore/routes/latest`: `Latest route fetched successfully`
    - 返却 route:
        - title: `IT Route A`
        - time_limit_minutes: `60`
        - total_distance_km: `12.3`
    - Supabase `announcements` 取得:
        - status: `200`
        - count: `1`
        - title: `【全体向け】新しいAI探索機能がリリースされました！`

### IT-004

- 実施結果: OK
- 確認内容:
    - `/api/health/mileage` に `1234` を送信
    - `vehicles.current_mileage` 更新
    - `health_logs` 追加
    - `oil_maintenance_status` 返却
- 根拠:
    - 更新前 DB: `1000|600`
    - 更新後 DB: `1234|600`
    - `health_logs`: `0 -> 1`
    - 最新 log: `1234|engine`

### IT-005

- 実施結果: OK
- 確認内容:
    - 前回オイル交換距離 `600` 未満の `500` を送信
    - `400` 応答
    - `vehicles.current_mileage` と `health_logs` が不変
- 根拠:
    - API: `400`
    - 更新後 DB: `1234`
    - `health_logs`: `1 -> 1`

### IT-006

- 実施結果: OK
- 確認内容:
    - ブラウザから画像をアップロードし解析処理を実行
    - 解析結果が表示されることを確認

### IT-007

- 実施結果: OK
- 確認内容:
    - ブラウザから音声入力を実施し解析処理を実行
    - 解析結果が表示されることを確認

### IT-008

- 実施結果: OK
- 確認内容:
    - ブラウザからhome画面のおすすめルート→Explorer画面に遷移することを確認

### IT-009

- 実施結果: OK
- 確認内容:
    - ブラウザからExplorer画面でルート検索
    - routesテーブルにデータ登録されていることを確認
    - 画面に検索結果が表示されていることを確認

### IT-010

- 実施結果: OK
- 確認内容:
    - 2026-03-30: ブラウザからExplorer画面でルート検索し、失敗メッセージを確認
    - 2026-04-01: 認証済みユーザーで `/api/explore/routes` に失敗条件の座標を送信
    - 2026-04-01: 失敗前後で `routes` / `waypoints` / `cinematic_spots` の件数を比較し、部分保存有無を確認
- 根拠:
    - API: `500`
    - body.error: `ルート生成中に予期しないエラーが発生しました。時間をおいて再度お試しください。`
    - DB 件数:
        - before: `routes=0, waypoints=0, spots=0`
        - after: `routes=0, waypoints=0, spots=0`

### IT-011

- 実施結果: OK
- 確認内容:
    - `user-a` のトークンで `user-b` 所有 route を参照
    - `/api/explore/routes/:id` が `403`
- 根拠:
    - API: `403`
    - body: `Forbidden: You do not own this route`

### IT-012

- 実施結果: OK
- 確認内容:
    - create画面で加工結果がダウンロードできることを確認

### IT-013

- 実施結果: OK
- 確認内容:
    - `/api/users/me` でプロフィールと車両情報を更新
    - `profiles` と `vehicles` に反映
- 根拠:
    - `profileDb`: `UpdatedA|Tester|updated-it-a`
    - `vehicleDb`: `Suzuki|GSX250R`

### IT-014

- 実施結果: OK
- 確認内容:
    - `last_oil_change_mileage=900`
    - `last_oil_change_date=2026-03-15`
    - `monthly_avg_mileage=350`
    - `oil_change_interval_km=5000`
    - `vehicles` / `maintenance_settings` / `maintenance_history` が同期
- 根拠:
    - `vehicleDb`: `900|2026-03-15|350`
    - `settingDb`: `oil|5000`
    - `maintenance_history`: `0 -> 2`
    - 生成履歴:
        - `maintenance_settings更新|1234|item_name=oil, previous_interval_km=4000, next_interval_km=5000`
        - `オイル交換|900|source=manual_oil_change_registration, last_oil_change_date=2026-03-15, last_oil_change_mileage=900`

### IT-015

- 実施結果: OK
- 確認内容:
    - `current_mileage=1234` に対して `last_oil_change_mileage=2000` を送信
    - `/api/users/me` が `400`
    - `vehicles.last_oil_change_mileage` は更新されない
- 根拠:
    - API: `400`
    - DB: `900`

### IT-016

- 実施結果: OK
- 確認内容:
    - 2026-03-30: 実際に試して、Notion と `contact_messages` へ登録された
    - 2026-04-01: `/api/contact` のレスポンス値と `contact_messages` の同期状態を再確認
- 根拠:
    - API: `201`
    - response.notionSyncStatus: `synced`
    - DB:
        - subject: `IT-016 retest 1775044943883`
        - notion_sync_status: `synced`
        - notion_sync_error: `null`
        - metadata.route: `/contact`

### IT-017

- 実施結果: OK
- 確認内容:
    - 2026-04-01: `NOTION_TOKEN` を無効化した追試用 backend で `/api/contact` を実行
    - API が `201` を返しつつ `notionSyncStatus='failed'` になることを確認
    - `contact_messages` に問い合わせレコードが残り、`notion_sync_status='failed'` とエラー内容が保存されることを確認
- 根拠:
    - API: `201`
    - response.notionSyncStatus: `failed`
    - DB:
        - subject: `IT-017 retest 1775045008869`
        - notion_sync_status: `failed`
        - notion_sync_error: `NOTION_TOKEN is not configured`
        - metadata.route: `/contact`

### IT-018

- 実施結果: OK
- 確認内容:
    - 同期APIを実行したら、`announcements`へ登録された

## 実施結果が NG の場合の原因と修正対応

- 初回実行では、テスト用 SQL が `routes` の `returning id` 出力に含まれるコマンドタグを考慮できていなかった
    - 対応: `returning id` の先頭行のみ採用するよう修正
- 別の初回実行では、`maintenance_history` に `created_at` が存在しない前提違いがあった
    - 対応: 並び順を `executed_at desc, id desc` に修正

## NG 修正対応後の再テスト実施結果

- 修正後に再実行し、上記 2 シナリオはすべて期待結果どおり
- 2026-04-01 に `IT-003` `IT-010` `IT-016` `IT-017` の不足観点を追試し、仕様書に合わせて結果を補完
- 一時ユーザー 2 件と `login_attempts` 1 件は削除済み
- 2026-04-01 追試で作成した一時ユーザー 1 件と一時 backend コンテナは削除済み

## 環境依存の制約、未確認事項、残リスク

- Home 画面の `announcements` 参照自体は 2026-04-01 に認証済み JWT で再確認したが、ドロワー UI 表示そのものはブラウザ自動化では未確認
- 仕様書の「Home へ遷移」「UI に表示」のうち、一部は手動ブラウザ確認と API/DB 確認の組み合わせで補完している
