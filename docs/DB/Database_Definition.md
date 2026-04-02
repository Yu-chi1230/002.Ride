# データベース定義書 (ride v1.0)

本ドキュメントは、「ride」プロジェクトで使用するデータベース（PostgreSQL / Supabase）の全テーブル構成、カラム定義、およびトリガーに関する仕様をまとめたものです。

---

## 1. カスタム型 (Enums)

| 型名 | 用途 | 定義値 |
| :--- | :--- | :--- |
| `health_log_type` | コンディション診断の種別 | `'engine'`, `'tire'`, `'chain'`, `'plug'`, `'meter'` |
| `health_log_status` | 非同期AI解析のステータス | `'pending'`, `'analyzing'`, `'completed'`, `'failed'` |
| `sns_platform` | SNSプラットフォーム | `'instagram'`, `'tiktok'`, `'youtube'`, `'x'` |

---

## 2. テーブル定義

### 2.1 ユーザー・車両管理 (Health領域起点)

#### `profiles` (ユーザー基本情報)
Supabase Authと連携するユーザープロファイル。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY | `auth.users(id)` への外部キー(ON DELETE CASCADE) |
| `username` | text | NOT NULL | ユーザー名 |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | レコード作成日時 |

#### `vehicles` (愛車情報)
ユーザーが所有する車両データと現在の消耗品ステータス。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | 車両ID |
| `user_id` | uuid | NOT NULL, REFERENCES profiles(id) | 所有ユーザー (CASCADE) |
| `model_name` | text | NOT NULL | 車種名 (例: Zephyr χ) |
| `current_mileage` | integer | DEFAULT 0, CHECK (>= 0) | 現在の総走行距離 (ODO) |
| `last_oil_change_mileage` | integer | CHECK (>= 0) | 前回オイル交換時の走行距離 |
| `last_chain_maintenance_mileage`| integer | CHECK (>= 0) | 前回チェーン清掃/交換時の走行距離 |
| `last_tire_change_mileage` | integer | CHECK (>= 0) | 前回タイヤ交換時の走行距離 |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | レコード作成日時 |

---

### 2.2 診断・メンテナンス履歴 (Health領域)

#### `health_logs` (AI診断履歴)
エンジン音や画像による各種診断の履歴データ。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | ログID |
| `vehicle_id` | uuid | NOT NULL, REFERENCES vehicles(id) | 対象車両 (CASCADE) |
| `log_type` | health_log_type | NOT NULL | 診断種別 |
| `status` | health_log_status | NOT NULL, DEFAULT 'completed' | 非同期解析ステータス |
| `media_url` | text | NULL | 録音音声・撮影画像の保存URL |
| `detected_mileage`| integer | CHECK (>= 0) | 記録された走行距離（現在は手動入力値を想定） |
| `ai_score` | float | CHECK (>= 0.0 AND <= 1.0) | AIによる健康度スコア |
| `ai_feedback` | text | NULL | AIからのテキストフィードバック |
| `raw_ai_response` | jsonb | NULL | Gemini等からの生レスポンスJSON |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | 診断日時 |

#### `ai_model_references` (AI比較用マスタ)
正常なエンジン音などを参照するためのマスタデータ。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | マスタID |
| `model_name` | text | NOT NULL, UNIQUE | 車種名 |
| `reference_audio_url`| text | NULL | 正常なエンジン音等のリファレンスURL |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | 作成日時 |

#### `maintenance_settings` (管理基準)
車両ごとの消耗品交換タイミングなどの基準値。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | 設定ID |
| `vehicle_id` | uuid | NOT NULL, REFERENCES vehicles(id) | 対象車両 (CASCADE) |
| `item_name` | text | NOT NULL | 項目名 (オイル, タイヤ等) |
| `interval_km` | integer | NOT NULL, CHECK (> 0) | 交換目安距離 (km) |
| *(UNIQUE)* | - | `UNIQUE(vehicle_id, item_name)` | 同一車両・同一項目の重複防止 |

#### `maintenance_history` (実整備記録)
実際のメンテナンス履歴。トリガーによる自動記帳も含む。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | 履歴ID |
| `vehicle_id` | uuid | NOT NULL, REFERENCES vehicles(id) | 対象車両 (CASCADE) |
| `action_type` | text | NOT NULL | 作業内容 (例: オイル交換) |
| `executed_at` | date | NOT NULL, DEFAULT current_date | 実施日 |
| `mileage_at_execution`| integer | NOT NULL, CHECK (>= 0) | 実施時の走行距離 |
| `notes` | text | NULL | 自由記述・自動記帳の補足説明など |

---

### 2.3 ルート・ナビゲーション (Explore領域)

#### `routes` (ルート基本)
タイムマネジメントで生成または保存されたルート情報。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | ルートID |
| `user_id` | uuid | NOT NULL, REFERENCES profiles(id) | 作成ユーザー (CASCADE) |
| `vehicle_id` | uuid | REFERENCES vehicles(id) | 走行車両 (SET NULL) |
| `title` | text | NOT NULL | ルート名 (例: 阿蘇1hエスケープ) |
| `time_limit_minutes`| integer | NOT NULL, CHECK (> 0) | 設定された制限時間(分) |
| `actual_duration_minutes`| integer | NULL | 実際の走行にかかった時間(分) |
| `total_distance_km`| float | NULL | 総走行距離(km) |
| `weather_at_start` | text | NULL | 出発時の天候 |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | 作成日時 |

#### `waypoints` (経路ポイント)
ルートを構成する緯度・経度のポイント群。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | ポイントID |
| `route_id` | uuid | NOT NULL, REFERENCES routes(id) | 対象ルート (CASCADE) |
| `latitude` | float8 | NOT NULL | 緯度 |
| `longitude` | float8 | NOT NULL | 経度 |
| `order_index` | integer | NOT NULL | 順序 |
| *(UNIQUE)* | - | `UNIQUE(route_id, order_index)` | 順序の重複防止 |

#### `cinematic_spots` (シネマティック撮影ガイド)
ルート上の「映える」撮影ポイント情報。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | スポットID |
| `route_id` | uuid | NOT NULL, REFERENCES routes(id) | 対象ルート (CASCADE) |
| `location_name` | text | NULL | スポット名 |
| `best_photo_time` | timestamptz | NULL | 最適な撮影予想時刻 |
| `sun_angle_data` | jsonb | NULL | 太陽高度や光の向きの計算データ |
| `shooting_guide` | text | NULL | AIによる撮影アドバイス |
| `latitude` | float8 | NULL | 緯度 |
| `longitude` | float8 | NULL | 経度 |

---

### 2.4 クリエイティブ・メディア編集 (Create領域)

#### `user_color_preferences` (色覚特性・色彩嗜好)
ユーザーごとの色覚特性や好みのLUT（カラーフィルタ）設定。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | - |
| `user_id` | uuid | NOT NULL, UNIQUE, REFERENCES profiles(id)| 対象ユーザー (CASCADE) |
| `color_vision_type`| text | NULL | P型, D型など、色覚特性の種別 |
| `preferred_lut` | text | NULL | 好みの映画調スタイル名 |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | - |

#### `creations` (制作物メイン)
ユーザーが撮影・編集した画像や動画のマスターレコード。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | 制作物ID |
| `user_id` | uuid | NOT NULL, REFERENCES profiles(id) | 作成ユーザー (CASCADE) |
| `route_id` | uuid | REFERENCES routes(id) | 関連ルート (SET NULL) |
| `raw_media_url` | text | NOT NULL | オリジナルメディアのURL |
| `processed_media_url`| text | NULL | AI補正/LUT適用後のメディアURL |
| `aspect_ratio` | text | DEFAULT '2.35:1' | シネマスコープなどのアスペクト比 |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | 作成日時 |

#### `cinematic_details` (AI演出・ナレーション詳細)
制作物に付随するAIの演出意図や音声データ。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | - |
| `creation_id` | uuid | NOT NULL, REFERENCES creations(id) | 対象制作物 (CASCADE) |
| `color_logic_memo` | text | NULL | 「なぜこの色に補正したか」の解説 |
| `narration_script` | text | NULL | AI生成ナレーションの台本（ポエム） |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | - |

#### `media_edits` (AI編集パラメータ)
再編集や適用フィルタの履歴を管理するテーブル。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | - |
| `creation_id` | uuid | NOT NULL, REFERENCES creations(id) | 対象制作物 (CASCADE) |
| `lut_used` | text | NULL | 適用したLUT名称 |
| `color_correction_json`| jsonb | NULL | 露出・彩度などの詳細数値 |
| `applied_filters` | text[] | NULL | 適用した追加フィルタのリスト |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | - |

#### `social_assets` (SNS投稿用アセット)
Instagramなどへの投稿に最適化されたメタデータ。
| カラム名 | データ型 | 制約・デフォルト値 | 備考 |
| :--- | :--- | :--- | :--- |
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | - |
| `creation_id` | uuid | NOT NULL, REFERENCES creations(id) | 対象制作物 (CASCADE) |
| `platform` | sns_platform | DEFAULT 'instagram' | 対象プラットフォーム |
| `caption_text` | text | NULL | AI生成のキャプション |
| `hashtags` | text[] | NULL | AI生成のハッシュタグリスト |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | - |

---

## 3. インデックス (検索最適化)
高速なクエリ実行のため、以下のインデックスが定義されています。

* `creations(user_id)` / `creations(route_id)`
* `cinematic_details(creation_id)` / `social_assets(creation_id)`
* `routes(user_id)` / `waypoints(route_id)` / `cinematic_spots(route_id)`
* `health_logs(vehicle_id)` / `maintenance_history(vehicle_id)` / `vehicles(user_id)`

---

## 4. DBトリガー (自動化処理)

システム側でデータ整合性を自動維持するためのスマート関数およびトリガーです。

### 4.1 ODO（走行距離）の自動更新
メーターのOCR診断（Health機能）が行われた際、車両の現在の走行距離（ODO）を自動で引き上げます。
* **トリガー名**: `trg_update_vehicle_mileage`
* **発火条件**: `health_logs` への `INSERT` 後
* **実行ロジック**: `log_type = 'meter'` かつ `detected_mileage` が取得できている場合、その値を `vehicles.current_mileage` に適用する。元の値より下がることはない（GREATEST関数）。

### 4.2 メンテナンス履歴の自動記帳
各種消耗品（オイル、チェーン、タイヤ）の交換基準距離が更新された際に、自動的に整備記録として台帳（`maintenance_history`）へ追記します。
* **トリガー名**: `trg_record_maintenance_history`
* **発火条件**: `vehicles` の `UPDATE` 後
* **実行ロジック**: `last_oil_change_mileage`, `last_chain_maintenance_mileage`, `last_tire_change_mileage` のいずれかに変化があった場合、変更後の走行距離を用いて `maintenance_history` へ『AI自動記帳』としてレコードを挿入する。
