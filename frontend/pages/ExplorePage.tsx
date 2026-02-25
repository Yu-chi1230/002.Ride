import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Circle, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import BottomNav from '../components/BottomNav';
import { apiFetch } from '../src/lib/api';
import 'leaflet/dist/leaflet.css';
import './ExplorePage.css';

// ===== Leaflet デフォルトアイコン修正 =====
// Vite でバンドルするとデフォルトマーカーが壊れる問題への対処
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

// ===== ゴールド色のカスタムマーカー（撮影スポット用） =====
const goldIcon = new L.DivIcon({
    className: '',
    html: `<div style="
        width: 28px; height: 28px;
        background: linear-gradient(135deg, #c8a050, #a4803a);
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center;
    "><span style="transform: rotate(45deg); font-size: 12px;">📸</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
});

// ===== 型定義 =====
type WaypointData = {
    latitude: number;
    longitude: number;
    order_index: number;
};

type CinematicSpotData = {
    location_name: string | null;
    shooting_guide: string | null;
    sun_angle_data: { altitude?: number; azimuth?: number } | null;
    latitude: number | null;
    longitude: number | null;
};

type RouteResult = {
    route: {
        id: string;
        title: string;
        time_limit_minutes: number;
        total_distance_km: number | null;
    };
    waypoints: WaypointData[];
    cinematic_spots: CinematicSpotData[];
};

// ===== 地図の中心を更新するヘルパーコンポーネント =====
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView([lat, lng], map.getZoom());
    }, [lat, lng, map]);
    return null;
}

// ===== タイムプリセット =====
const TIME_PRESETS = [
    { label: '30min', value: 30 },
    { label: '1h', value: 60 },
    { label: '1.5h', value: 90 },
    { label: '2h', value: 120 },
    { label: '3h', value: 180 },
];

// ===== メインコンポーネント =====
function ExplorePage() {
    const navigate = useNavigate();

    // 状態管理
    const [timeLimit, setTimeLimit] = useState(60);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [locationError, setLocationError] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
    const sliderRef = useRef<HTMLInputElement>(null);

    // ===== 現在地取得 =====
    const fetchLocation = useCallback(() => {
        setLocationError(false);
        if (!navigator.geolocation) {
            setLocationError(true);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            () => {
                // 位置情報が取得できない場合は熊本市（デフォルト）を使用
                setUserLocation({ lat: 32.8032, lng: 130.7079 });
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    }, []);

    useEffect(() => {
        fetchLocation();
    }, [fetchLocation]);

    // ===== スライダーの進捗を CSS 変数で反映 =====
    useEffect(() => {
        if (sliderRef.current) {
            const progress = ((timeLimit - 30) / (180 - 30)) * 100;
            sliderRef.current.style.setProperty('--slider-progress', `${progress}%`);
        }
    }, [timeLimit]);

    // ===== ルート検索 =====
    const handleSearch = async () => {
        if (!userLocation) return;
        setIsSearching(true);
        try {
            const res = await apiFetch('/api/explore/routes', {
                method: 'POST',
                body: JSON.stringify({
                    time_limit_minutes: timeLimit,
                    latitude: userLocation.lat,
                    longitude: userLocation.lng,
                }),
            });
            if (res.ok) {
                const json = await res.json();
                setRouteResult(json.data);
            } else {
                console.error('Route search failed:', res.status);
            }
        } catch (err) {
            console.error('Route search error:', err);
        } finally {
            setIsSearching(false);
        }
    };

    // ===== ルートのポリライン座標 =====
    const polylinePositions: [number, number][] =
        routeResult?.waypoints
            ?.sort((a, b) => a.order_index - b.order_index)
            .map((wp) => [wp.latitude, wp.longitude]) ?? [];

    // ===== 到達可能範囲の半径（概算: 時間 × 平均速度40km/h → メートル） =====
    const reachRadius = (timeLimit / 60) * 40 * 1000 * 0.5; // 片道なので /2

    // ===== 時間のフォーマット（表示用） =====
    const formatTime = (mins: number) => {
        if (mins < 60) return { value: String(mins), unit: 'min' };
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return { value: m > 0 ? `${h}:${String(m).padStart(2, '0')}` : String(h), unit: m > 0 ? 'h' : 'h' };
    };

    const timeDisplay = formatTime(timeLimit);

    // ===== 結果を閉じる =====
    const handleCloseResult = () => {
        setRouteResult(null);
    };

    return (
        <div className="explore-page">
            {/* ===== 地図 ===== */}
            {userLocation && (
                <div className="explore-map-container">
                    <MapContainer
                        center={[userLocation.lat, userLocation.lng]}
                        zoom={11}
                        zoomControl={false}
                        attributionControl={false}
                        style={{ width: '100%', height: '100%' }}
                    >
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                        <RecenterMap lat={userLocation.lat} lng={userLocation.lng} />

                        {/* 到達可能範囲サークル（結果表示前のみ） */}
                        {!routeResult && (
                            <Circle
                                center={[userLocation.lat, userLocation.lng]}
                                radius={reachRadius}
                                pathOptions={{
                                    color: '#c8a050',
                                    fillColor: '#c8a050',
                                    fillOpacity: 0.06,
                                    weight: 1,
                                    dashArray: '6 4',
                                }}
                            />
                        )}

                        {/* ルートのポリライン */}
                        {routeResult && polylinePositions.length > 0 && (
                            <Polyline
                                positions={polylinePositions}
                                pathOptions={{
                                    color: '#c8a050',
                                    weight: 3,
                                    opacity: 0.9,
                                }}
                            />
                        )}

                        {/* 撮影スポットマーカー */}
                        {routeResult?.cinematic_spots
                            ?.filter((s) => s.latitude && s.longitude)
                            .map((spot, idx) => (
                                <Marker
                                    key={idx}
                                    position={[spot.latitude!, spot.longitude!]}
                                    icon={goldIcon}
                                >
                                    <Popup>
                                        <div style={{ color: '#333', fontSize: '0.8rem' }}>
                                            <strong>{spot.location_name}</strong>
                                            <br />
                                            {spot.shooting_guide}
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                    </MapContainer>
                </div>
            )}

            {/* ===== ヘッダー ===== */}
            <div className="explore-header">
                <button className="explore-back-btn" onClick={() => navigate('/home')}>
                    ←
                </button>
                <span className="explore-title">Explore</span>
                <div className="explore-header-spacer" />
            </div>

            {/* ===== 位置情報エラー ===== */}
            {locationError && !userLocation && (
                <div className="location-error">
                    <div className="location-error-icon">📍</div>
                    <p className="location-error-text">
                        位置情報が取得できません。
                        <br />
                        ブラウザの位置情報を許可してください。
                    </p>
                    <button className="location-retry-btn" onClick={fetchLocation}>
                        再取得
                    </button>
                </div>
            )}

            {/* ===== 検索パネル (結果がない時) ===== */}
            {!routeResult && userLocation && (
                <div className="explore-panel">
                    {/* タイムセレクター */}
                    <div className="time-selector">
                        <div className="time-selector-label">Time Limit</div>
                        <div className="time-display">
                            <span className="time-value">{timeDisplay.value}</span>
                            <span className="time-unit">{timeDisplay.unit}</span>
                        </div>
                        <input
                            ref={sliderRef}
                            type="range"
                            className="time-slider"
                            min={30}
                            max={180}
                            step={30}
                            value={timeLimit}
                            onChange={(e) => setTimeLimit(Number(e.target.value))}
                        />
                        <div className="time-presets">
                            {TIME_PRESETS.map((p) => (
                                <span
                                    key={p.value}
                                    className={`time-preset-label ${timeLimit === p.value ? 'active' : ''}`}
                                    onClick={() => setTimeLimit(p.value)}
                                >
                                    {p.label}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* 検索ボタン */}
                    <button
                        className="search-route-btn"
                        onClick={handleSearch}
                        disabled={isSearching || !userLocation}
                    >
                        {isSearching ? (
                            <span className="search-loading">
                                <span className="loading-spinner" />
                                ルート検索中…
                            </span>
                        ) : (
                            <>
                                <span className="btn-icon">🗺️</span>
                                ルートを検索
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* ===== 結果パネル ===== */}
            {routeResult && (
                <div className="result-panel">
                    <div className="result-header">
                        <h2 className="result-title">{routeResult.route.title}</h2>
                        <button className="result-close-btn" onClick={handleCloseResult}>
                            ✕
                        </button>
                    </div>

                    <div className="result-stats">
                        <div className="result-stat">
                            <span className="result-stat-value">
                                {routeResult.route.total_distance_km?.toFixed(1) ?? '--'}
                            </span>
                            <span className="result-stat-label">km</span>
                        </div>
                        <div className="result-stat">
                            <span className="result-stat-value">
                                {routeResult.route.time_limit_minutes}
                            </span>
                            <span className="result-stat-label">min</span>
                        </div>
                    </div>

                    {/* 撮影スポット */}
                    {routeResult.cinematic_spots.length > 0 && (
                        <div className="spots-section">
                            <div className="spots-label">📸 Cinematic Spots</div>
                            {routeResult.cinematic_spots.map((spot, idx) => (
                                <div key={idx} className="spot-card">
                                    <div className="spot-name">
                                        <span className="spot-name-icon">📍</span>
                                        {spot.location_name ?? `スポット ${idx + 1}`}
                                    </div>
                                    {spot.shooting_guide && (
                                        <div className="spot-guide">{spot.shooting_guide}</div>
                                    )}
                                    {spot.sun_angle_data && (
                                        <div className="spot-sun-info">
                                            ☀️ 太陽高度 {spot.sun_angle_data.altitude}°
                                            {spot.sun_angle_data.azimuth && ` / 方位 ${spot.sun_angle_data.azimuth}°`}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <button className="new-search-btn" onClick={handleCloseResult}>
                        🔄 別のルートを検索
                    </button>
                </div>
            )}

            {/* ===== BottomNav ===== */}
            <BottomNav />
        </div>
    );
}

export default ExplorePage;
