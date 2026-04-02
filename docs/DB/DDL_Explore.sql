-- 1. ルート基本テーブル
CREATE TABLE routes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
    title text NOT NULL,
    time_limit_minutes integer NOT NULL CHECK (time_limit_minutes > 0),
    total_distance_km float,
    weather_at_start text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 2. 経路ポイント（Google Maps等での描画用）
CREATE TABLE waypoints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    order_index integer NOT NULL,
    UNIQUE(route_id, order_index)
);

-- 3. シネマティック撮影ガイド
CREATE TABLE cinematic_spots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    location_name text,
    best_photo_time timestamp with time zone,
    sun_angle_data jsonb, -- 太陽高度などの詳細
    shooting_guide text, -- AIからの撮影指示
    latitude double precision,
    longitude double precision
);

-- 4. 検索最適化用インデックス
CREATE INDEX idx_routes_user_id ON routes(user_id);
CREATE INDEX idx_waypoints_route_id ON waypoints(route_id);
CREATE INDEX idx_cinematic_spots_route_id ON cinematic_spots(route_id);