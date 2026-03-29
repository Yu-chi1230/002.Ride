# Create画面 単体テストエビデンス（Success）

## テスト観点
- CR-UT-001 初期表示
- CR-UT-002 初期状態
- CR-UT-003 画像選択
- CR-UT-004 初回自動生成予約
- CR-UT-005 テーマ切替
- CR-UT-006 強度変更
- CR-UT-007 強度操作完了
- CR-UT-008 正常応答反映
- CR-UT-009 エラー応答
- CR-UT-010 AbortError
- CR-UT-011 多重生成制御
- CR-UT-012 保存処理
- CR-UT-013 アンマウント
- CR-UT-014 ファイル未選択ガード
- CR-UT-015 API例外系
- CR-UT-016 file input再選択
- CR-UT-017 保存ボタン無効時
- CR-UT-018 無効レスポンス耐性

## テスト観点に紐づくテスト実施結果
- 実施コマンド:  
  `docker exec 002ride-frontend-1 sh -lc 'cd /app && npm run test:unit -- src/test/CreatePage.spec.tsx'`
- 実施日時: 2026-03-28
- 結果: **1ファイル / 18テスト実行 / 18成功 / 0失敗**
- 対象ファイル:
  - `frontend/src/test/CreatePage.spec.tsx`

## 実施結果がNGの場合の修正対応
- 初回実行で `CR-UT-007` が失敗
  - 失敗内容: `expected "spy" to be called 1 times, but got 0 times`
  - 原因: 強度スライダーではなく比較スライダーを操作していた
  - 修正対応: 強度スライダー選択セレクタを  
    `input[type="range"][min="0"][max="100"]:not(.comparison-slider)` に変更

## NG修正対応後の再テスト実施結果
- 再実行結果: **1ファイル / 18テスト実行 / 18成功 / 0失敗**

## 未確認事項または残リスク
- 本実行は `CreatePage.spec.tsx` のみ対象（他画面の全体テストは未実施）
- React Router v7 future flag warning は出力されるが、今回のテスト成否には影響なし

