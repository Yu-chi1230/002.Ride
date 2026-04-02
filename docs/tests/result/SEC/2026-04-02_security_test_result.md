# ride セキュリティテスト結果

## 1. 実施概要
- 実施日時: 2026-04-02 21:05 JST
- 実施場所: `/Users/yusn/Documents/10.AiDev/002.Ride`
- 対象仕様: `docs/tests/specification/SEC/Ride_SecurityTest_Spec.md`
- 実施環境:
  - frontend container: `002ride-frontend-1`
  - backend container: `002ride-backend-1`
  - database container: `002ride-SDB`
  - API: `http://127.0.0.1:8001`

## 2. 実施方法
- backend コンテナ内で `node /app/security_test.js` を実行した。
- Supabase Auth を利用して使い捨てユーザーを新規作成し、一般ユーザー権限で API を検証した。
- DB 確認は backend コンテナ内から `DATABASE_URL` を使って実施した。
- Supabase 直接参照観点は `SUPABASE_URL` と `SUPABASE_ANON_KEY` を使って確認した。
- 破壊的試験や高負荷試験は行っていない。

## 3. 結果サマリ

| 観点 | 結果 | 実結果要約 |
| --- | --- | --- |
| SEC-001 未認証アクセス | OK | 認証必須 API 8 観点はすべて 401 |
| SEC-002 不正トークン | OK | `/api/users/me` は 401、内部情報露出は確認されず |
| SEC-003 onboarding 改ざん | OK | body の `userId` 改ざんは無効で、JWT 利用者の ID にのみ保存 |
| SEC-004 IDOR | OK | 他人の `/api/explore/routes/:id` は 403 |
| SEC-005 管理 API 権限制御 | OK | 一般ユーザーの `/api/admin/announcements/sync` は 403 |
| SEC-006A-E 問い合わせ入力検証 | OK | メール、category、件名長、本文長は各 400、DB 件数増加なし |
| SEC-007 問い合わせメタデータなりすまし | NG | 未認証 `/api/contact` で任意 `metadata.userId` を保存できた |
| SEC-008 announcements の RLS | OK | 未認証は全体向けのみ、認証済みは自分向けのみ追加表示 |
| SEC-009 contact_messages の RLS | OK | Supabase 直接参照では問い合わせ本文を読めなかった |
| SEC-010 contact-attachments の Storage 設定 | NG | バケットが public で、匿名の select/update/delete も許可されていた |

## 4. 詳細結果

### 4.1 OK
- SEC-001
  - `/api/users/me`, `/api/users/onboarding`, `/api/health/mileage`, `/api/explore/routes`, `/api/explore/routes/latest`, `/api/explore/routes/:id`, `/api/create/generate`, `/api/admin/announcements/sync` を未認証で呼び、すべて 401 を確認。
- SEC-002
  - `Authorization: Bearer invalid-token` で `/api/users/me` を呼び、401 を確認。
  - レスポンス本文に stack trace、SQL、Prisma 名などの内部情報は含まれなかった。
- SEC-003
  - ユーザー A の token で `/api/users/onboarding` を実行し、body に `userId=ユーザーB` を混入した。
  - `profiles.id` はユーザー A の ID で保存され、改ざん値は使われなかった。
  - 実装上も `req.user.id` を使用しており、body の `userId` は無視する方針になっている。
- SEC-004
  - ユーザー A が作成した route を、ユーザー B で `/api/explore/routes/:id` 参照したところ 403。
  - レスポンスは `Forbidden: You do not own this route` で、他人の route 詳細データは返らなかった。
- SEC-005
  - 一般ユーザー token で `/api/admin/announcements/sync` を呼び、403 を確認。
  - レスポンスは `Forbidden: Super admin only`。
- SEC-006A-E
  - 不正メールは 400。
  - 不正 category は 400。
  - 61 文字件名は 400。
  - 2001 文字本文は 400。
  - 実施前後で `contact_messages` 件数増加なし。
- SEC-008
  - `announcements` を Supabase へ直接参照した。
  - 未認証では全体向けの有効通知 1 件のみ表示された。
  - ユーザー A では全体向けと A 向けの 2 件のみ表示された。
  - ユーザー B では全体向けと B 向けの 2 件のみ表示された。
  - 期限切れ通知は誰にも返らなかった。
- SEC-009
  - `contact_messages` を Supabase へ直接参照した。
  - 未認証、認証済み一般ユーザーのいずれでも対象データは 0 件で返った。
  - `No direct reads` の RLS 方針と整合した。

### 4.2 NG と原因
- SEC-007
  - 未認証で `/api/contact` を呼び、`metadata.userId` に別ユーザー ID を指定すると 201 で保存された。
  - `contact_messages.metadata.userId` に指定した他人の ID がそのまま記録された。
  - 原因は、`/api/contact` で `req.user?.id` がない場合に `metadata.userId` をそのまま採用しているため。
  - 該当実装:
    - [backend/server.ts](/Users/yusn/Documents/10.AiDev/002.Ride/backend/server.ts#L586)
    - [backend/server.ts](/Users/yusn/Documents/10.AiDev/002.Ride/backend/server.ts#L607)
    - [backend/server.ts](/Users/yusn/Documents/10.AiDev/002.Ride/backend/server.ts#L613)
- SEC-010
  - `contact-attachments` バケット設定を確認したところ `public=true` だった。
  - `storage.objects` には `anon, authenticated` に対して `SELECT`, `UPDATE`, `DELETE` を許可するポリシーが存在した。
  - 問い合わせ添付ファイルの公開範囲としては広すぎ、匿名の read/update/delete を抑止できていない。
  - 該当設定:
    - [contact_messages.sql](/Users/yusn/Documents/10.AiDev/002.Ride/supabase/volumes/db/contact_messages.sql#L59)
    - [contact_messages.sql](/Users/yusn/Documents/10.AiDev/002.Ride/supabase/volumes/db/contact_messages.sql#L73)
    - [contact_messages.sql](/Users/yusn/Documents/10.AiDev/002.Ride/supabase/volumes/db/contact_messages.sql#L80)
    - [contact_messages.sql](/Users/yusn/Documents/10.AiDev/002.Ride/supabase/volumes/db/contact_messages.sql#L87)
    - [contact_messages.sql](/Users/yusn/Documents/10.AiDev/002.Ride/supabase/volumes/db/contact_messages.sql#L95)

## 5. 再テスト結果
- なし
  - `SEC-007`, `SEC-010` の修正は未実施のため、再テストも未実施。

## 6. 未確認事項
- ブラウザ観点の XSS、CSRF、クリックジャッキング
- Health/Create のファイルアップロードに対する MIME 偽装やサイズ境界試験
- Google OAuth、Notion、Gemini など外部連携先を含む詳細な攻撃面確認
- CORS のブラウザ実動作とプリフライト境界
- レート制限の網羅確認と DoS 耐性
- `profiles`, `vehicles`, `routes`, `creations` の RLS を本番設計として有効活用するかどうかの方針確認

## 7. 残リスク
- `/api/contact` は公開 API であり、保存メタデータの信頼境界を誤ると、問い合わせの関連ユーザー識別を汚染できる。
- `contact-attachments` は現設定のままだと公開範囲が広く、問い合わせ添付が個人情報を含む場合に露出リスクがある。
- 主要業務データの保護は API 側認可に強く依存しており、RLS を前提にした二重防御にはなっていない。
- 画面からの実操作ではなく API 中心の確認であるため、フロント側の防御は別途確認が必要。
