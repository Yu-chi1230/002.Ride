# ride セキュリティテスト仕様書

## 1. 目的
- 認証必須 API、権限制御、入力値検証、公開問い合わせ導線、Supabase の Auth / RLS / Storage 設定の活用状況を確認し、不正アクセスやなりすましの見落としを減らす。

## 2. テスト対象範囲
- 対象
  - `/api/users/me`
  - `/api/users/onboarding`
  - `/api/health/mileage`
  - `/api/explore/routes`
  - `/api/explore/routes/latest`
  - `/api/explore/routes/:id`
  - `/api/create/generate`
  - `/api/admin/announcements/sync`
  - `/api/contact`
  - Supabase 直接参照の `announcements`
  - Supabase RLS 設定の `contact_messages`
  - Supabase Storage 設定の `contact-attachments`
- 対象外
  - Google OAuth 自体の設定不備診断
  - ブラウザ上の XSS、CSRF、クリックジャッキングの実ブラウザ診断
  - 外部サービス障害時の詳細侵入試験
  - 高負荷、DoS、レート制限耐性の大規模試験

## 3. 対象環境と権限条件
- 実施場所: `/Users/yusn/Documents/10.AiDev/002.Ride`
- 実施環境:
  - frontend container: `002ride-frontend-1`
  - backend container: `002ride-backend-1`
  - database container: `002ride-SDB`
- API 接続先: `http://127.0.0.1:8001`
- 実行方法:
  - backend コンテナ内で `node /app/security_test.js` を実行する
  - Supabase Auth を使って使い捨てユーザーを作成する
  - DB は backend コンテナから `DATABASE_URL` を使って確認する
  - Supabase 直接参照観点は `SUPABASE_URL` と `SUPABASE_ANON_KEY` を使って確認する

## 4. 保護対象データと公開境界
- 保護対象データ
  - `profiles`, `vehicles`, `routes`, `creations`, `contact_messages`, `announcements`
  - 認証ユーザーのプロフィール、走行データ、生成物、保存ルート
  - 問い合わせ本体と問い合わせ添付ファイル
- 公開境界
  - 認証必須 API は Bearer token 必須
  - 管理 API は super admin のみ許可
  - 問い合わせ API は未認証でも利用可能だが、保存されるメタデータはサーバー側で信頼境界を制御する必要がある
  - `announcements` は frontend から Supabase へ直接参照しており、可視範囲は RLS に依存する
  - `contact_messages` は Supabase 直接参照では読み書きできないことが望ましい
  - `profiles`, `vehicles`, `routes`, `creations` など主要データの保護は現状 API 側認可に強く依存しており、RLS を前提とする設計ではないことを前提として確認する
  - `contact-attachments` は Storage バケット公開範囲とオブジェクト権限を明示的に確認する

## 5. セキュリティ観点一覧

| ID | 観点 | 期待結果 |
| --- | --- | --- |
| SEC-001 | 未認証アクセス | 認証必須 API は 401 を返す |
| SEC-002 | 不正トークン | 無効トークンでは 401 を返し、内部情報を漏らさない |
| SEC-003 | onboarding 改ざん | body の `userId` を改ざんしても JWT の利用者にのみ保存される |
| SEC-004 | IDOR | 他人のルート詳細は 403 で拒否される |
| SEC-005 | 管理 API 権限制御 | 一般ユーザーは管理 API を呼べない |
| SEC-006A | 問い合わせ入力検証: メール | 不正メールは 400 で拒否される |
| SEC-006B | 問い合わせ入力検証: category | 不正 category は 400 で拒否される |
| SEC-006C | 問い合わせ入力検証: 件名長 | 61 文字件名は 400 で拒否される |
| SEC-006D | 問い合わせ入力検証: 本文長 | 2001 文字本文は 400 で拒否される |
| SEC-006E | 問い合わせ入力検証: DB 保存 | 不正入力では `contact_messages` 件数が増えない |
| SEC-007 | 問い合わせメタデータなりすまし | 未認証リクエストで任意 `userId` を保存できない |
| SEC-008 | announcements の RLS | 未認証は全体向けのみ、認証済みは自分向けだけ追加で見える |
| SEC-009 | contact_messages の RLS | Supabase 直接参照で問い合わせ本文を読めない |
| SEC-010 | contact-attachments の Storage 設定 | バケットは非公開で、匿名の広い read/update/delete を許可しない |

## 6. 詳細テストケース

### SEC-001 未認証アクセス
- 前提条件: 認証ヘッダを付けない
- 手順:
  1. `/api/users/me` `GET`
  2. `/api/users/onboarding` `POST`
  3. `/api/health/mileage` `PUT`
  4. `/api/explore/routes` `POST`
  5. `/api/explore/routes/latest` `GET`
  6. `/api/create/generate` `POST`
  7. `/api/admin/announcements/sync` `POST`
  8. 前提データ作成後に `/api/explore/routes/:id` `GET`
- 期待結果: すべて 401

### SEC-002 不正トークン
- 前提条件: `Authorization: Bearer invalid-token`
- 手順:
  1. `/api/users/me` `GET`
- 期待結果:
  - 401
  - レスポンス本文に stack trace、SQL、Prisma などの内部情報が出ない

### SEC-003 onboarding 改ざん
- 前提条件: 使い捨てユーザー A/B を作成済み
- 手順:
  1. ユーザー A の token で `/api/users/onboarding` を呼ぶ
  2. body に `userId=ユーザーB` を混入する
  3. DB の `profiles` を確認する
- 期待結果:
  - ユーザー A のプロフィールだけが A の ID で保存される

### SEC-004 IDOR
- 前提条件: ユーザー A で `/api/explore/routes` を使ってルートを 1 件作成済み
- 手順:
  1. ユーザー B の token で `/api/explore/routes/:id` を呼ぶ
- 期待結果:
  - 403
  - 他人のルート詳細データは返らない

### SEC-005 管理 API 権限制御
- 前提条件: 一般ユーザー token を用意済み
- 手順:
  1. `/api/admin/announcements/sync` を呼ぶ
- 期待結果: 403

### SEC-006A 問い合わせ入力検証: メール
- 前提条件: 未認証でもよい
- 手順:
  1. 不正メールを含む `/api/contact` を送る
- 期待結果: 400

### SEC-006B 問い合わせ入力検証: category
- 前提条件: 未認証でもよい
- 手順:
  1. 不正 category を含む `/api/contact` を送る
- 期待結果: 400

### SEC-006C 問い合わせ入力検証: 件名長
- 前提条件: 未認証でもよい
- 手順:
  1. 61 文字件名を含む `/api/contact` を送る
- 期待結果: 400

### SEC-006D 問い合わせ入力検証: 本文長
- 前提条件: 未認証でもよい
- 手順:
  1. 2001 文字本文を含む `/api/contact` を送る
- 期待結果: 400

### SEC-006E 問い合わせ入力検証: DB 保存
- 前提条件: `SEC-006A` から `SEC-006D` を実施する
- 手順:
  1. 実施前後で `contact_messages` 件数を確認する
- 期待結果:
  - 不正入力の実施前後で `contact_messages` 件数は増えない

### SEC-007 問い合わせメタデータなりすまし
- 前提条件: 未認証で実行する
- 手順:
  1. `/api/contact` に `metadata.userId=他ユーザーID` を付けて送る
  2. `contact_messages.metadata` を確認する
- 期待結果:
  - サーバー側で無視、または空に上書きされる
  - 未認証リクエストが任意の `userId` を永続化できない

### SEC-008 announcements の RLS
- 前提条件:
  - 全体向け通知 1 件
  - ユーザー A 向け通知 1 件
  - ユーザー B 向け通知 1 件
  - 期限切れ通知 1 件
  を用意する
- 手順:
  1. 未認証で Supabase から `announcements` を直接参照する
  2. ユーザー A token で直接参照する
  3. ユーザー B token で直接参照する
- 期待結果:
  - 未認証は全体向けの有効通知だけ見える
  - ユーザー A は全体向けと A 向けだけ見える
  - ユーザー B は全体向けと B 向けだけ見える
  - 期限切れ通知は誰にも見えない

### SEC-009 contact_messages の RLS
- 前提条件: `contact_messages` に対象データが 1 件以上存在する
- 手順:
  1. 未認証で Supabase から `contact_messages` を直接参照する
  2. 認証済み一般ユーザーで直接参照する
- 期待結果:
  - 問い合わせ本文を直接読めない
  - 少なくとも対象データは 0 件で返る

### SEC-010 contact-attachments の Storage 設定
- 前提条件: `contact-attachments` バケット設定と `storage.objects` ポリシーを確認できる
- 手順:
  1. `storage.buckets` の `contact-attachments` 設定を確認する
  2. `storage.objects` の該当ポリシーを確認する
- 期待結果:
  - バケットは非公開
  - 匿名または一般ユーザーに広い `select/update/delete` を許可しない
