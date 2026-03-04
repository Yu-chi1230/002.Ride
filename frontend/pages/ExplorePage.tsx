import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import BottomNav from '../components/BottomNav';
import TouchSlider from '../components/TouchSlider';
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
        width: 14px; height: 14px;
        background: #0D1117;
        border: 2px solid #D4AF37;
        transform: rotate(45deg);
        box-shadow: 0 0 10px rgba(212, 175, 55, 0.5);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
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
    { label: '00:30', value: 30 },
    { label: '05:00', value: 300 },
];

// ===== メインコンポーネント =====
function ExplorePage() {
    const navigate = useNavigate();

    // 状態管理
    const [timeLimit, setTimeLimit] = useState(() => parseInt(localStorage.getItem('default_riding_time') || '60', 10));
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [locationError, setLocationError] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [routeResults, setRouteResults] = useState<RouteResult[] | null>(null);
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

    const activeRouteResult = routeResults?.[selectedRouteIndex] ?? null;

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
    // useEffect(() => {
    //     if (sliderRef.current) {
    //         const progress = ((timeLimit - 30) / (300 - 30)) * 100;
    //         sliderRef.current.style.setProperty('--slider-progress', `${progress}%`);
    //     }
    // }, [timeLimit, userLocation, routeResults]);

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
                setRouteResults(json.data.routes || []);
                setSelectedRouteIndex(0);
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
        activeRouteResult?.waypoints
            ?.sort((a, b) => a.order_index - b.order_index)
            .map((wp) => [wp.latitude, wp.longitude]) ?? [];



    // ===== 時間のフォーマット（表示用） =====
    const formatTime = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return { value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, unit: '' };
    };

    const timeDisplay = formatTime(timeLimit);

    // ===== 結果を閉じる =====
    const handleCloseResult = () => {
        setRouteResults(null);
        setSelectedRouteIndex(0);
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

                        {/* ルートのポリライン */}
                        {activeRouteResult && polylinePositions.length > 0 && (
                            <Polyline
                                positions={polylinePositions}
                                pathOptions={{
                                    color: '#D4AF37',
                                    weight: 3,
                                    opacity: 0.8,
                                }}
                            />
                        )}

                        {/* 撮影スポットマーカー */}
                        {activeRouteResult?.cinematic_spots
                            ?.filter((s) => s.latitude && s.longitude)
                            .map((spot, idx) => (
                                <Marker
                                    key={idx}
                                    position={[spot.latitude!, spot.longitude!]}
                                    icon={goldIcon}
                                >
                                    <Popup>
                                        <div style={{ color: '#0D1117', fontSize: '0.85rem', fontFamily: "'Noto Sans JP', sans-serif" }}>
                                            <strong style={{ display: 'block', marginBottom: '4px' }}>{spot.location_name}</strong>
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

            {/* ===== 0件メッセージ ===== */}
            {routeResults !== null && routeResults.length === 0 && (
                <div className="explore-panel zero-routes-panel">
                    <p className="zero-routes-text">
                        指定された時間内で行けるルートが見つかりませんでした。<br />
                        制限時間を延長して再検索してください。
                    </p>
                    <button className="new-search-btn" onClick={handleCloseResult}>
                        条件を変えて再検索
                    </button>
                </div>
            )}

            {/* ===== 検索パネル (結果がない時) ===== */}
            {routeResults === null && userLocation && (
                <div className="explore-panel">
                    {/* タイムセレクター */}
                    <div className="time-selector">
                        <div className="time-selector-label">所用時間</div>
                        <div className="time-display">
                            <span className="time-value">{timeDisplay.value}</span>
                            <span className="time-unit">{timeDisplay.unit}</span>
                        </div>
                        <TouchSlider
                            min={30}
                            max={300}
                            step={30}
                            value={timeLimit}
                            onChange={(val) => setTimeLimit(val)}
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
                                探索中...
                            </span>
                        ) : (
                            <>
                                探索を開始する
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* ===== 結果パネル ===== */}
            {activeRouteResult && routeResults && (
                <div className="result-panel">
                    <div className="result-header">
                        <h2 className="result-title">{routeResults.length}件のルートが見つかりました</h2>
                        <button className="result-close-btn" onClick={handleCloseResult}>
                            ✕
                        </button>
                    </div>

                    {/* ルート一覧カルーセル */}
                    {routeResults.length > 1 && (
                        <div className="route-carousel">
                            {routeResults.map((res, idx) => (
                                <div
                                    key={res.route.id}
                                    className={`carousel-card ${idx === selectedRouteIndex ? 'active' : ''}`}
                                    onClick={() => setSelectedRouteIndex(idx)}
                                >
                                    <div className="carousel-card-title">{res.route.title}</div>
                                    <div className="carousel-card-stats">
                                        {res.route.total_distance_km?.toFixed(1) ?? '--'} km / {formatTime(res.route.time_limit_minutes).value}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="active-route-title-section">
                        <h3 className="active-route-title">{activeRouteResult.route.title}</h3>
                    </div>

                    <div className="result-stats">
                        <div className="result-stat">
                            <span className="result-stat-value">
                                {activeRouteResult.route.total_distance_km?.toFixed(1) ?? '--'}
                            </span>
                            <span className="result-stat-label">km</span>
                        </div>
                        <div className="result-stat">
                            <span className="result-stat-value">
                                {formatTime(activeRouteResult.route.time_limit_minutes).value}
                            </span>
                        </div>
                    </div>

                    {/* 撮影スポット */}
                    {activeRouteResult.cinematic_spots.length > 0 && (
                        <div className="spots-section">
                            <div className="spots-label">CINEMATIC SPOTS</div>
                            {activeRouteResult.cinematic_spots.map((spot, idx) => (
                                <div key={idx} className="spot-card">
                                    <div className="spot-name">
                                        <span className="spot-name-icon"></span>
                                        {spot.location_name ?? `スポット ${idx + 1}`}
                                    </div>
                                    {spot.shooting_guide && (
                                        <div className="spot-guide">{spot.shooting_guide}</div>
                                    )}
                                    {spot.sun_angle_data && (
                                        <div className="spot-sun-info">
                                            SUN_ALT {spot.sun_angle_data.altitude}°
                                            {spot.sun_angle_data.azimuth && ` / AZIMUTH ${spot.sun_angle_data.azimuth}°`}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <button
                        className="search-route-btn"
                        style={{ marginTop: '1.2rem', marginBottom: '0.5rem' }}
                        onClick={() => navigate(`/explore/guide/${activeRouteResult.route.id}`)}
                    >
                        ナビゲーションを開始
                    </button>

                    <button className="new-search-btn" onClick={handleCloseResult}>
                        条件を変えて再検索
                    </button>
                </div>
            )}

            {/* ===== BottomNav ===== */}
            <BottomNav />
        </div>
    );
}

export default ExplorePage;
