# Explore機能 単体テストエビデンス（Success）

## テスト観点
- EXM-UT-001 初期表示: ExplorePage の探索UI表示
- EXM-UT-002 ルート探索API正常系: 探索開始時の API 呼び出し
- EXM-UT-003 探索失敗時の状態復帰: API失敗後に再操作可能
- EXM-UT-004 Guide詳細取得成功: ExploreGuidePage の詳細取得後HUD表示
- EXM-UT-005 Guide詳細取得失敗: エラーメッセージ表示
- EXM-UT-006 Guideクリーンアップ: アンマウント時の geolocation 監視解除

## テスト観点に紐づくテスト実施結果
- 実施コマンド:  
  `docker exec 002ride-frontend-1 sh -lc 'cd /app && npm run test:unit -- src/test/ExplorePage.spec.tsx src/test/ExploreGuidePage.spec.tsx'`
- 実施日時: 2026-03-29
- 結果: **2ファイル / 6テスト実行 / 6成功 / 0失敗**
- 対象ファイル:
  - `frontend/src/test/ExplorePage.spec.tsx`
  - `frontend/src/test/ExploreGuidePage.spec.tsx`

## 実施結果がNGの場合の修正対応
- 該当なし（全件成功）

## NG修正対応後の再テスト実施結果
- 該当なし（全件成功）

## 未確認事項または残リスク
- 本実行は Explore 機能の対象テストのみを実行。既存の全体テスト不具合（`SettingPage.spec.tsx`）は未解消。
- React Router v7 future flag warning が出力されるが、今回のテスト結果には影響なし。
