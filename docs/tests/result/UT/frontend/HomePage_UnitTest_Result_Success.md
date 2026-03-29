# Home画面 単体テストエビデンス（Success）

## テスト観点
- HM-UT-001 初期表示
- HM-UT-002 背景画像適用
- HM-UT-003 背景画像未設定
- HM-UT-004 最新ルートAPI呼び出し条件
- HM-UT-005 最新ルート取得成功表示
- HM-UT-006 最新ルート取得失敗表示
- HM-UT-007 お知らせ取得成功表示
- HM-UT-008 お知らせ空状態
- HM-UT-009 お知らせ取得失敗耐性
- HM-UT-010 ドロワー開閉
- HM-UT-011 ルートカード遷移(最新あり)
- HM-UT-012 ルートカード遷移(最新なし)
- HM-UT-013 通知日付整形
- HM-UT-014 個別通知ラベル

## テスト観点に紐づくテスト実施結果
- 実施コマンド: `docker exec 002ride-frontend-1 sh -lc 'cd /app && npm run test:unit -- src/test/HomePage.spec.tsx'`
- 実施日時: 2026-03-29
- 結果: **13件実行 / 13件成功 / 0件失敗**
- 対象ファイル: `frontend/src/test/HomePage.spec.tsx`

## 実施結果がNGの場合の修正対応
- 該当なし（全件成功）

## NG修正対応後の再テスト実施結果
- 該当なし（全件成功）

## 未確認事項または残リスク
- React Router v7 future flag に関する warning が出力されるが、今回テスト成否には影響なし。
