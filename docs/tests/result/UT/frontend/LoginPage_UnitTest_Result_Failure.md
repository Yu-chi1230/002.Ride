# ログイン画面 単体テスト結果報告書（異常終了）

## 1. 実施概要

- 対象画面: `frontend/pages/LoginPage.tsx`
- 対象テスト: `frontend/src/test/LoginPage.spec.tsx`
- 実施日時: 2026-03-14 21:34:09 JST
- 実行場所: `002.Ride/frontend`
- 終了種別: 異常終了ログの記録

## 2. 異常終了 1

- 実行コマンド: `npm run test:unit -- src/test/LoginPage.spec.tsx`
- 終了コード: `1`

### 原因

`vi.mock` が hoist される前提に対して、モック関数をトップレベル `const` で初期化していたため、`ReferenceError: Cannot access 'mockSignInWithOAuth' before initialization` が発生した。

### 対応

- `vi.hoisted()` を使ってモック関数定義を先行評価するよう修正した。

### ログ抜粋

```text
FAIL  src/test/LoginPage.spec.tsx [ src/test/LoginPage.spec.tsx ]
Error: [vitest] There was an error when mocking a module.
Caused by: ReferenceError: Cannot access 'mockSignInWithOAuth' before initialization
```

## 3. 異常終了 2

- 実行コマンド: `npm run test:unit -- src/test/LoginPage.spec.tsx`
- 終了コード: `1`

### 原因

`LP-UT-001` の初期表示テストで、ロゴ見出しのアクセシブルネームを `/ride/i` と仮定していたが、実 DOM ではアクセント文字の分割により `r ide` と解釈され、アサートが不一致になった。

### 対応

- 取得条件を「`h1` 見出しであること」に変更し、`toHaveTextContent('ride')` で実テキストを確認する形へ修正した。

### ログ抜粋

```text
FAIL  src/test/LoginPage.spec.tsx > LoginPage > LP-UT-001 初期表示: 主要 UI が表示される
TestingLibraryElementError: Unable to find an accessible element with the role "heading" and name `/ride/i`
```

## 4. 最終状態

- 上記 2 件を修正後、同一テストを再実行し正常終了を確認済み。
- 正常終了の結果は `LoginPage_UnitTest_Result_Success.md` に記録した。

