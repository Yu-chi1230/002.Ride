-- 1. カスタム型の定義（診断種別を限定してデータの汚れを防ぐ）
CREATE TYPE health_log_type AS ENUM ('engine', 'tire', 'chain', 'plug', 'meter');

-- 2. profilesテーブル（ユーザー基本情報）
CREATE TABLE profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 3. vehiclesテーブル（愛車情報）
CREATE TABLE vehicles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    model_name text NOT NULL,
    current_mileage integer DEFAULT 0 CHECK (current_mileage >= 0),
    last_oil_change_mileage integer CHECK (last_oil_change_mileage >= 0),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. ai_model_referencesテーブル（AI比較用マスタ）
CREATE TABLE ai_model_references (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name text NOT NULL UNIQUE, -- 車種名で検索するためUNIQUE
    reference_audio_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 5. health_logsテーブル（AI診断履歴）
CREATE TABLE health_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    log_type health_log_type NOT NULL,
    media_url text,
    detected_mileage integer CHECK (detected_mileage >= 0),
    ai_score float CHECK (ai_score >= 0.0 AND ai_score <= 1.0),
    ai_feedback text,
    raw_ai_response jsonb, -- AIの回答を丸ごと保存
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 6. maintenance_settingsテーブル（管理基準）
CREATE TABLE maintenance_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    item_name text NOT NULL,
    interval_km integer NOT NULL CHECK (interval_km > 0),
    UNIQUE(vehicle_id, item_name) -- 同じ車両で同じ項目の設定が重複しないように
);

-- 7. maintenance_historyテーブル（実整備記録）
CREATE TABLE maintenance_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    action_type text NOT NULL,
    executed_at date DEFAULT current_date NOT NULL,
    mileage_at_execution integer NOT NULL CHECK (mileage_at_execution >= 0),
    notes text
);

-- 8. インデックス作成（検索をシュッと速くするため）
CREATE INDEX idx_health_logs_vehicle_id ON health_logs(vehicle_id);
CREATE INDEX idx_maintenance_history_vehicle_id ON maintenance_history(vehicle_id);
CREATE INDEX idx_vehicles_user_id ON vehicles(user_id);