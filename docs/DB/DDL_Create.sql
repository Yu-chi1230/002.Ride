-- ==========================================
-- 1. Create関連のカスタム型・設定
-- ==========================================
-- SNSプラットフォーム定義
CREATE TYPE sns_platform AS ENUM ('instagram', 'tiktok', 'youtube', 'x');

-- ==========================================
-- 2. Create機能 テーブル定義
-- ==========================================

-- ユーザーの色覚特性・色彩嗜好
CREATE TABLE user_color_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
    color_vision_type text, -- P型, D型, T型など
    preferred_lut text,     -- 好みの映画調スタイル名
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 制作物メイン（画像・動画）
CREATE TABLE creations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    route_id uuid REFERENCES routes(id) ON DELETE SET NULL,
    raw_media_url text NOT NULL,        -- オリジナル素材
    processed_media_url text,           -- AI補正後素材
    aspect_ratio text DEFAULT '2.35:1', -- シネマスコープ等
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- AI演出・ナレーション詳細
CREATE TABLE cinematic_details (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creation_id uuid NOT NULL REFERENCES creations(id) ON DELETE CASCADE,
    color_logic_memo text,      -- 「なぜこの色か」の解説（重要：色覚特性サポート用）
    narration_script text,      -- Geminiが生成した台本
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- AI編集パラメータ（再現用）
CREATE TABLE media_edits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creation_id uuid NOT NULL REFERENCES creations(id) ON DELETE CASCADE,
    lut_used text,
    color_correction_json jsonb, -- 露出、彩度などの数値
    applied_filters text[],      -- 適用フィルタリスト
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- SNS投稿用アセット（Instagram即投稿用）
CREATE TABLE social_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creation_id uuid NOT NULL REFERENCES creations(id) ON DELETE CASCADE,
    platform sns_platform DEFAULT 'instagram',
    caption_text text,           -- AI生成のエモいキャプション
    hashtags text[],             -- AI選定ハッシュタグ
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ==========================================
-- 3. パフォーマンス最適化（インデックス）
-- ==========================================
CREATE INDEX idx_creations_user_id ON creations(user_id);
CREATE INDEX idx_creations_route_id ON creations(route_id);
CREATE INDEX idx_cinematic_details_creation_id ON cinematic_details(creation_id);
CREATE INDEX idx_social_assets_creation_id ON social_assets(creation_id);