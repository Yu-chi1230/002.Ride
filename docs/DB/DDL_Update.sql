-- ==========================================
-- DDL_Update.sql: DBへの追加提案（カラム拡充・トリガー定義）
-- ※すでに作成済みのテーブルに適用するための ALTER および CREATE TRIGGER を含みます。
-- ==========================================

-- ---------------------------------------------------------------------------
-- 1. カラムの追加
-- ---------------------------------------------------------------------------

-- ① vehicles テーブル（消耗品交換距離の履歴追加）
ALTER TABLE vehicles
ADD COLUMN last_chain_maintenance_mileage integer CHECK (last_chain_maintenance_mileage >= 0),
ADD COLUMN last_tire_change_mileage integer CHECK (last_tire_change_mileage >= 0);

-- ② health_logs テーブル（AI解析の非同期ステータス管理）
CREATE TYPE health_log_status AS ENUM ('pending', 'analyzing', 'completed', 'failed');
ALTER TABLE health_logs
ADD COLUMN status health_log_status DEFAULT 'completed' NOT NULL;

-- ③ routes テーブル（実走行時間の記録追加）
ALTER TABLE routes
ADD COLUMN actual_duration_minutes integer;


-- ---------------------------------------------------------------------------
-- 2. 自動更新トリガーの作成
-- ---------------------------------------------------------------------------

-- ① メーター画像判定時に走行距離(ODO)を自動更新する関数とトリガー
CREATE OR REPLACE FUNCTION update_vehicle_mileage()
RETURNS TRIGGER AS $$
BEGIN
    -- log_typeが'meter'であり、AIが走行距離を検出できた場合
    IF NEW.log_type = 'meter' AND NEW.detected_mileage IS NOT NULL THEN
        UPDATE vehicles
        SET current_mileage = GREATEST(current_mileage, NEW.detected_mileage) -- 値が減る現象を防止
        WHERE id = NEW.vehicle_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_vehicle_mileage
AFTER INSERT ON health_logs
FOR EACH ROW
EXECUTE FUNCTION update_vehicle_mileage();


-- ② （任意）オイル交換などの履歴を自動記帳する関数とトリガー
-- ※車両テーブルの last_oil_change_mileage が更新された時に自動で履歴を残します。
CREATE OR REPLACE FUNCTION record_maintenance_history()
RETURNS TRIGGER AS $$
BEGIN
    -- オイル交換距離が新しい値に更新された場合
    IF NEW.last_oil_change_mileage IS DISTINCT FROM OLD.last_oil_change_mileage AND NEW.last_oil_change_mileage IS NOT NULL THEN
        INSERT INTO maintenance_history (vehicle_id, action_type, mileage_at_execution, notes)
        VALUES (NEW.id, 'AI自動記帳: オイル交換', NEW.last_oil_change_mileage, 'システムによる検知/更新');
    END IF;

    -- チェーン清掃/交換時
    IF NEW.last_chain_maintenance_mileage IS DISTINCT FROM OLD.last_chain_maintenance_mileage AND NEW.last_chain_maintenance_mileage IS NOT NULL THEN
        INSERT INTO maintenance_history (vehicle_id, action_type, mileage_at_execution, notes)
        VALUES (NEW.id, 'AI自動記帳: チェーンメンテ', NEW.last_chain_maintenance_mileage, 'システムによる検知/更新');
    END IF;

    -- タイヤ交換時
    IF NEW.last_tire_change_mileage IS DISTINCT FROM OLD.last_tire_change_mileage AND NEW.last_tire_change_mileage IS NOT NULL THEN
        INSERT INTO maintenance_history (vehicle_id, action_type, mileage_at_execution, notes)
        VALUES (NEW.id, 'AI自動記帳: タイヤ交換', NEW.last_tire_change_mileage, 'システムによる検知/更新');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_record_maintenance_history
AFTER UPDATE ON vehicles
FOR EACH ROW
EXECUTE FUNCTION record_maintenance_history();

-- ---------------------------------------------------------------------------
-- 3. お知らせ機能の追加 (Announcements)
-- ---------------------------------------------------------------------------

CREATE TABLE announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    is_global boolean NOT NULL DEFAULT true,  -- true: 全体向け, false: 個別向け
    target_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    title text NOT NULL,
    content text NOT NULL,
    start_date timestamp with time zone NOT NULL DEFAULT now(),
    end_date timestamp with time zone,      -- nullの場合は期限なし
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    
    -- 制約: 全体向けの場合は target_user_id は null でなければならない
    --       個別向けの場合は target_user_id は null であってはならない
    CONSTRAINT valid_target CHECK (
        (is_global = true AND target_user_id IS NULL) OR
        (is_global = false AND target_user_id IS NOT NULL)
    )
);

-- インデックス
CREATE INDEX idx_announcements_dates ON announcements(start_date, end_date);
CREATE INDEX idx_announcements_target ON announcements(target_user_id);

-- RLS (Row Level Security) 設定
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- 誰もが全体向け、または自分向けの有効なお知らせを閲覧可能
CREATE POLICY "Users can view relevant announcements" ON announcements
    FOR SELECT
    USING (
        (start_date <= now() AND (end_date IS NULL OR end_date > now()))
        AND
        (is_global = true OR target_user_id = auth.uid())
    );

-- テストデータ投入例（オプション）
-- INSERT INTO announcements (is_global, title, content) VALUES (true, '新しいAIルート生成エンジン「Gemini 1.5 Pro」を試験導入しました。', 'お知らせの詳細...');

