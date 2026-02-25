/**
 * Mock Route Service
 * MVP段階のモック版ルート生成サービス。
 * 制限時間に応じて阿蘇エリアのサンプルルートデータを返す。
 * 将来的にGemini API / Google Routes APIに差し替え予定。
 */

type MockWaypoint = {
    latitude: number;
    longitude: number;
    order_index: number;
};

type MockSpot = {
    location_name: string;
    shooting_guide: string;
    sun_angle_data: { altitude: number; azimuth: number };
    latitude: number;
    longitude: number;
};

type MockRouteResult = {
    title: string;
    total_distance_km: number;
    waypoints: MockWaypoint[];
    cinematic_spots: MockSpot[];
};

// ===== 阿蘇エリアのサンプルルートデータ =====
const ROUTE_TEMPLATES: Record<string, MockRouteResult> = {
    short: {
        title: '阿蘇パノラマライン ショートエスケープ',
        total_distance_km: 35.2,
        waypoints: [
            { latitude: 32.8032, longitude: 130.7079, order_index: 0 }, // 熊本市
            { latitude: 32.8400, longitude: 130.7500, order_index: 1 },
            { latitude: 32.8800, longitude: 130.8000, order_index: 2 },
            { latitude: 32.9200, longitude: 130.8500, order_index: 3 },
            { latitude: 32.9500, longitude: 130.9000, order_index: 4 }, // 阿蘇方面
            { latitude: 32.9200, longitude: 130.8500, order_index: 5 },
            { latitude: 32.8800, longitude: 130.8000, order_index: 6 },
            { latitude: 32.8032, longitude: 130.7079, order_index: 7 }, // 帰着
        ],
        cinematic_spots: [
            {
                location_name: '二重峠展望所',
                shooting_guide: '道路脇の展望スペースから阿蘇方面を撮影。午後の光が正面から差し込みます。',
                sun_angle_data: { altitude: 35, azimuth: 220 },
                latitude: 32.9200,
                longitude: 130.8500,
            },
        ],
    },
    medium: {
        title: '阿蘇パノラマライン 大観峰ルート',
        total_distance_km: 68.5,
        waypoints: [
            { latitude: 32.8032, longitude: 130.7079, order_index: 0 }, // 熊本市
            { latitude: 32.8500, longitude: 130.7600, order_index: 1 },
            { latitude: 32.9000, longitude: 130.8200, order_index: 2 },
            { latitude: 32.9500, longitude: 130.8800, order_index: 3 },
            { latitude: 32.9800, longitude: 130.9500, order_index: 4 },
            { latitude: 33.0100, longitude: 131.0500, order_index: 5 }, // 大観峰
            { latitude: 32.9800, longitude: 130.9500, order_index: 6 },
            { latitude: 32.9500, longitude: 130.8800, order_index: 7 },
            { latitude: 32.9000, longitude: 130.8200, order_index: 8 },
            { latitude: 32.8032, longitude: 130.7079, order_index: 9 }, // 帰着
        ],
        cinematic_spots: [
            {
                location_name: '大観峰展望所',
                shooting_guide: '駐車場から展望台まで徒歩5分。左斜め後ろからの撮影で夕陽に照らされた愛車が最高です。',
                sun_angle_data: { altitude: 28, azimuth: 250 },
                latitude: 33.0100,
                longitude: 131.0500,
            },
            {
                location_name: 'ミルクロード 草原ポイント',
                shooting_guide: '道沿いに広がる草原でローアングル撮影。空の広がりを活かしたシネマティックな構図が決まります。',
                sun_angle_data: { altitude: 40, azimuth: 200 },
                latitude: 32.9800,
                longitude: 130.9500,
            },
        ],
    },
    long: {
        title: '阿蘇・やまなみハイウェイ周遊',
        total_distance_km: 115.0,
        waypoints: [
            { latitude: 32.8032, longitude: 130.7079, order_index: 0 },  // 熊本市
            { latitude: 32.8500, longitude: 130.7600, order_index: 1 },
            { latitude: 32.9200, longitude: 130.8400, order_index: 2 },
            { latitude: 32.9600, longitude: 130.9200, order_index: 3 },
            { latitude: 33.0100, longitude: 131.0500, order_index: 4 },  // 大観峰
            { latitude: 33.0800, longitude: 131.1200, order_index: 5 },  // やまなみハイウェイ
            { latitude: 33.1000, longitude: 131.1800, order_index: 6 },
            { latitude: 33.0500, longitude: 131.1000, order_index: 7 },
            { latitude: 33.0100, longitude: 131.0500, order_index: 8 },
            { latitude: 32.9600, longitude: 130.9200, order_index: 9 },
            { latitude: 32.8800, longitude: 130.8000, order_index: 10 },
            { latitude: 32.8032, longitude: 130.7079, order_index: 11 }, // 帰着
        ],
        cinematic_spots: [
            {
                location_name: '大観峰展望所',
                shooting_guide: '阿蘇五岳を一望できる名所。パノラマ撮影でスケール感を出しましょう。',
                sun_angle_data: { altitude: 30, azimuth: 240 },
                latitude: 33.0100,
                longitude: 131.0500,
            },
            {
                location_name: 'やまなみハイウェイ 長者原付近',
                shooting_guide: '広大な草原とワインディングロードの組み合わせ。走行中の動画撮影にも最適です。',
                sun_angle_data: { altitude: 45, azimuth: 190 },
                latitude: 33.0800,
                longitude: 131.1200,
            },
            {
                location_name: '阿蘇草千里ヶ浜',
                shooting_guide: '噴煙を背景に撮影可能。手前に愛車、奥に中岳の噴煙という構図がおすすめ。',
                sun_angle_data: { altitude: 32, azimuth: 210 },
                latitude: 32.8800,
                longitude: 131.0800,
            },
        ],
    },
};

/**
 * 制限時間に応じたモックルートを生成する
 * @param timeLimitMinutes 制限時間（分）
 * @param lat 現在地の緯度（将来的にルート算出に使用）
 * @param lng 現在地の経度
 */
export function generateMockRoute(
    timeLimitMinutes: number,
    _lat: number,
    _lng: number
): MockRouteResult {
    if (timeLimitMinutes <= 60) {
        return ROUTE_TEMPLATES.short;
    } else if (timeLimitMinutes <= 120) {
        return ROUTE_TEMPLATES.medium;
    } else {
        return ROUTE_TEMPLATES.long;
    }
}
