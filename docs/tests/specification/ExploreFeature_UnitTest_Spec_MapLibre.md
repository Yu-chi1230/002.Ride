# Explore機能 単体テスト仕様書（MapLibre移行）

## テスト観点
- EX-UT-001 初期表示: ExplorePage の探索UI表示
- EX-UT-003 ルート探索API正常系: 探索開始時の API 呼び出し
- EX-UT-005 探索失敗時の状態復帰: API失敗後に再操作可能
- EX-UT-012 Guide詳細取得成功: ExploreGuidePage の詳細取得後HUD表示
- EX-UT-013 Guide詳細取得失敗: エラーメッセージ表示
- EX-UT-016 Guideクリーンアップ: アンマウント時の geolocation 監視解除

## 実施手順
1. `maplibre-gl` をモック化し、地図描画依存を排除した単体テストを実装する。
2. `navigator.geolocation` をモックし、`getCurrentPosition` / `watchPosition` / `clearWatch` を制御する。
3. `apiFetch` をモックし、`/api/explore/routes` と `/api/explore/routes/:id` の正常応答を返す。
4. 以下コマンドで Explore 対象テストのみ実行する。  
   `docker exec 002ride-frontend-1 sh -lc 'cd /app && npm run test:unit -- src/test/ExplorePage.spec.tsx src/test/ExploreGuidePage.spec.tsx'`

## 期待結果
- ExplorePage 初期表示で `探索を開始する` が表示される。
- `探索を開始する` 押下で `/api/explore/routes` が適切な payload で呼ばれる。
- ExplorePage で API 失敗時にローディング解除され、再操作可能になる。
- ExploreGuidePage で `/api/explore/routes/route-1` が呼ばれ、HUD が表示される。
- ExploreGuidePage で API 失敗時に `ルート情報の取得に失敗しました。` が表示される。
- アンマウント時に `clearWatch(watchId)` が呼ばれる。
