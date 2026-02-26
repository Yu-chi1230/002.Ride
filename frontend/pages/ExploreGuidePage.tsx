import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { apiFetch } from '../src/lib/api';
import 'leaflet/dist/leaflet.css';
import './ExploreGuidePage.css';

// ===== カスタムアイコン群 =====
const goldIcon = new L.DivIcon({
    className: '',
    html: `<div style="
        width: 24px; height: 24px;
        background: linear-gradient(135deg, #c8a050, #a4803a);
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        display: flex; align-items: center; justify-content: center;
    "><span style="transform: rotate(45deg); font-size: 10px;">📸</span></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
});

const userLocationIcon = new L.DivIcon({
    className: '',
    html: `<div class="user-location-marker">
             <div class="user-location-pulse"></div>
             <div class="user-location-dot"></div>
           </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});

// ===== 追従コンポーネント =====
function TrackUserLocation({ lat, lng, isTracking }: { lat: number; lng: number, isTracking: boolean }) {
    const map = useMap();
    useEffect(() => {
        if (isTracking && lat && lng) {
            // center the map smoothly on the user's location
            map.flyTo([lat, lng], 16, { animate: true, duration: 1.5 });
        }
    }, [lat, lng, isTracking, map]);
    return null;
}

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

type DetailedRoute = {
    route: {
        id: string;
        title: string;
        time_limit_minutes: number;
        total_distance_km: number | null;
    };
    waypoints: WaypointData[];
    cinematic_spots: CinematicSpotData[];
};

export default function ExploreGuidePage() {
    const { routeId } = useParams<{ routeId: string }>();
    const navigate = useNavigate();

    const [routeData, setRouteData] = useState<DetailedRoute | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Geolocation state
    const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number, speed: number | null, heading: number | null }>({
        lat: 32.8032, lng: 130.7079, speed: null, heading: null // Fallback default
    });
    const [isTracking, setIsTracking] = useState(true); // Toggle auto-center
    const watchIdRef = useRef<number | null>(null);

    // 1. ルートデータのフェッチ
    const fetchRoute = useCallback(async () => {
        try {
            setLoading(true);
            const res = await apiFetch(`/api/explore/routes/${routeId}`, { method: 'GET' });
            if (!res.ok) throw new Error('Failed to fetch route');
            const json = await res.json();
            setRouteData(json.data);
        } catch (err: any) {
            console.error(err);
            setError('ルート情報の取得に失敗しました。');
        } finally {
            setLoading(false);
        }
    }, [routeId]);

    useEffect(() => {
        if (routeId) {
            fetchRoute();
        }
    }, [fetchRoute, routeId]);

    // 2. 位置情報の監視開始
    useEffect(() => {
        if (!navigator.geolocation) {
            setError('お使いの端末は位置情報をサポートしていません。');
            return;
        }

        const handlePosition = (pos: GeolocationPosition) => {
            setCurrentPos({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                speed: pos.coords.speed,     // m/s
                heading: pos.coords.heading, // degrees
            });
        };

        const handleError = (err: GeolocationPositionError) => {
            console.warn('Geolocation error:', err);
            // Don't show critical error to allow map viewing even if GPS is lost temporarily
        };

        watchIdRef.current = navigator.geolocation.watchPosition(
            handlePosition,
            handleError,
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, []);

    // ===== UI Helpers =====
    const polylinePositions: [number, number][] =
        routeData?.waypoints
            ?.sort((a, b) => a.order_index - b.order_index)
            .map((wp) => [wp.latitude, wp.longitude]) ?? [];

    // Simple nearest spot calculation
    const nearestSpot = routeData?.cinematic_spots[0]; // For MVP, just show the first spot

    // Convert m/s to km/h
    const displaySpeed = currentPos.speed !== null ? Math.round(currentPos.speed * 3.6) : 0;

    if (loading) {
        return (
            <div className="guide-loading">
                <div className="loading-spinner" style={{ borderColor: 'rgba(200, 160, 80, 0.3)', borderTopColor: '#c8a050' }}></div>
                <p style={{ marginTop: '1rem', color: '#c8a050', letterSpacing: '0.1em' }}>INITIALIZING NAVIGATION...</p>
            </div>
        );
    }

    if (error || !routeData) {
        return (
            <div className="guide-error">
                <p className="guide-error-text">{error || 'ルートが見つかりません'}</p>
                <button className="guide-back-btn" onClick={() => navigate('/explore')}>戻る</button>
            </div>
        );
    }

    return (
        <div className="guide-page">
            {/* ===== Map Layer ===== */}
            <div className="guide-map-container">
                <MapContainer
                    center={[currentPos.lat, currentPos.lng]}
                    zoom={16}
                    zoomControl={false}
                    attributionControl={false}
                    style={{ width: '100%', height: '100%' }}
                // Handle map drag to temporarily disable auto-tracking
                // onDragStart={() => setIsTracking(false)} 
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; OpenStreetMap contributors'
                    />

                    {/* ユーザー現在地 */}
                    <Marker position={[currentPos.lat, currentPos.lng]} icon={userLocationIcon} />

                    {/* カメラ追従ロジック */}
                    <TrackUserLocation lat={currentPos.lat} lng={currentPos.lng} isTracking={isTracking} />

                    {/* ルートの線 */}
                    {polylinePositions.length > 0 && (
                        <Polyline
                            positions={polylinePositions}
                            pathOptions={{
                                color: '#c8a050',
                                weight: 6,
                                opacity: 0.7,
                                lineCap: 'round',
                                lineJoin: 'round'
                            }}
                        />
                    )}

                    {/* 撮影スポット */}
                    {routeData.cinematic_spots
                        .filter((s) => s.latitude && s.longitude)
                        .map((spot, idx) => (
                            <Marker
                                key={idx}
                                position={[spot.latitude!, spot.longitude!]}
                                icon={goldIcon}
                            >
                                <Popup>
                                    <div style={{ color: '#333', fontSize: '0.8rem' }}>
                                        <strong>{spot.location_name}</strong>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                </MapContainer>
            </div>

            {/* ===== HUD Top (Notifications) ===== */}
            <div className="guide-hud-top">
                {nearestSpot && (
                    <div className="hud-notification">
                        <div className="hud-notification-header">
                            <span className="hud-notification-title">NEXT CINEMATIC SPOT</span>
                            {/* Dummy distance for MVP */}
                            <span className="hud-notification-distance">2.4 km</span>
                        </div>
                        <div className="hud-spot-name">{nearestSpot.location_name}</div>
                        <div className="hud-spot-guide">{nearestSpot.shooting_guide}</div>

                        {nearestSpot.sun_angle_data && (
                            <div className="hud-sun-info">
                                <span className="sun-status-badge">Golden Hour</span>
                                <span>光の角度: {nearestSpot.sun_angle_data.altitude}° 順光推奨</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ===== HUD Bottom (Controls & Stats) ===== */}
            <div className="guide-hud-bottom">
                <button className="guide-action-btn btn-end-route" onClick={() => navigate('/explore')}>
                    ✕
                </button>

                <button
                    className="guide-action-btn"
                    onClick={() => setIsTracking(!isTracking)}
                    style={{ backgroundColor: isTracking ? 'rgba(200, 160, 80, 0.2)' : 'rgba(30, 30, 35, 0.85)', color: isTracking ? '#c8a050' : '#fff', borderColor: isTracking ? 'rgba(200, 160, 80, 0.4)' : 'rgba(255, 255, 255, 0.1)' }}
                >
                    📍
                </button>

                <div className="guide-stats">
                    <span className="stat-speed-value">{displaySpeed}</span>
                    <span className="stat-speed-unit">KM/H</span>
                </div>
            </div>
        </div>
    );
}
