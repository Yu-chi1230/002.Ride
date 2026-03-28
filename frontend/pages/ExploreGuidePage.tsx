import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import maplibregl, { GeoJSONSource } from 'maplibre-gl';
import { apiFetch } from '../src/lib/api';
import 'maplibre-gl/dist/maplibre-gl.css';
import './ExploreGuidePage.css';

const MAP_STYLE_URL =
    import.meta.env.VITE_MAP_STYLE_URL ||
    (import.meta.env.VITE_MAPTILER_KEY
        ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${import.meta.env.VITE_MAPTILER_KEY}`
        : 'https://tiles.openfreemap.org/styles/liberty');

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const applyJapaneseLabelPreference = (map: maplibregl.Map) => {
    const layers = map.getStyle()?.layers ?? [];
    layers.forEach((layer) => {
        if (layer.type !== 'symbol') {
            return;
        }
        const isRoadLabelLayer = /(road|highway|motorway|trunk|route|shield)/i.test(layer.id);
        try {
            const current = map.getLayoutProperty(layer.id, 'text-field');
            if (!current) {
                return;
            }
            if (isRoadLabelLayer) {
                const routeRef = [
                    'coalesce',
                    ['get', 'ref'],
                    ['get', 'route_ref'],
                    ['get', 'nat_ref'],
                    '',
                ] as const;
                const jaName = [
                    'coalesce',
                    ['get', 'name:ja'],
                    ['get', 'name_ja'],
                    ['get', 'name'],
                    '',
                ] as const;
                const routeNetwork = [
                    'coalesce',
                    ['get', 'network'],
                    ['get', 'route_network'],
                    ['get', 'nat_network'],
                    '',
                ] as const;
                map.setLayoutProperty(layer.id, 'text-field', [
                    'coalesce',
                    [
                        'case',
                        ['all', ['>', ['length', routeRef], 0], ['any', ['in', 'pref', routeNetwork], ['in', '県道', jaName]]],
                        '',
                        ['all', ['>', ['length', routeRef], 0], ['in', '県道', jaName]],
                        '',
                        ['all', ['>', ['length', routeRef], 0], ['any', ['in', 'national', routeNetwork], ['in', '国道', jaName]]],
                        '',
                        ['all', ['>', ['length', routeRef], 0], ['in', '国道', jaName]],
                        '',
                        ['coalesce', ['get', 'name:ja'], ['get', 'name_ja'], ''],
                    ],
                    ['coalesce', ['get', 'name:ja'], ['get', 'name_ja'], ''],
                ]);
                map.setPaintProperty(layer.id, 'icon-opacity', 0);
            } else {
                map.setLayoutProperty(layer.id, 'text-field', [
                    'coalesce',
                    ['get', 'name:ja'],
                    ['get', 'name_ja'],
                    '',
                ]);
            }
        } catch {
            // Some symbol layers don't allow text-field override.
        }
    });
};

// ===== 型定義 =====
type WaypointData = {
    latitude: number;
    longitude: number;
    order_index: number;
};

type RouteGeometryPoint = {
    latitude: number;
    longitude: number;
    order_index: number;
};

type CinematicSpotData = {
    best_photo_time?: string | null;
    location_name: string | null;
    shooting_guide: string | null;
    sun_angle_data: {
        altitude?: number;
        azimuth?: number;
        best_photo_window_label?: string;
        best_photo_window_reason?: string;
    } | null;
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
    route_geometry?: RouteGeometryPoint[];
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
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const userMarkerRef = useRef<maplibregl.Marker | null>(null);
    const spotMarkersRef = useRef<maplibregl.Marker[]>([]);

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
        (routeData?.route_geometry && routeData.route_geometry.length > 0
            ? routeData.route_geometry
            : routeData?.waypoints)
            ?.sort((a, b) => a.order_index - b.order_index)
            .map((wp) => [wp.latitude, wp.longitude]) ?? [];

    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) {
            return;
        }

        const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style: MAP_STYLE_URL,
            center: [currentPos.lng, currentPos.lat],
            zoom: 16,
            attributionControl: false,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        map.on('load', () => applyJapaneseLabelPreference(map));
        map.on('dragstart', () => setIsTracking(false));
        mapRef.current = map;

        return () => {
            userMarkerRef.current?.remove();
            userMarkerRef.current = null;
            spotMarkersRef.current.forEach((marker) => marker.remove());
            spotMarkersRef.current = [];
            map.remove();
            mapRef.current = null;
        };
    }, [currentPos.lat, currentPos.lng]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) {
            return;
        }

        if (!userMarkerRef.current) {
            const markerElement = document.createElement('div');
            markerElement.className = 'user-location-marker';
            markerElement.innerHTML = '<div class="user-location-pulse"></div><div class="user-location-dot"></div>';
            userMarkerRef.current = new maplibregl.Marker({
                element: markerElement,
                anchor: 'center',
            }).setLngLat([currentPos.lng, currentPos.lat]).addTo(map);
        } else {
            userMarkerRef.current.setLngLat([currentPos.lng, currentPos.lat]);
        }

        if (isTracking) {
            map.easeTo({
                center: [currentPos.lng, currentPos.lat],
                zoom: 16,
                duration: 1200,
            });
        }
    }, [currentPos, isTracking]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) {
            return;
        }

        const applyRouteLayer = () => {
            const lineCoordinates = polylinePositions.map(([lat, lng]) => [lng, lat]);
            const lineData: GeoJSON.FeatureCollection = {
                type: 'FeatureCollection',
                features: lineCoordinates.length > 1
                    ? [{
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: lineCoordinates,
                        },
                    }]
                    : [],
            };

            const sourceId = 'guide-route-source';
            const layerId = 'guide-route-layer';
            const source = map.getSource(sourceId) as GeoJSONSource | undefined;
            if (source) {
                source.setData(lineData);
            } else {
                map.addSource(sourceId, { type: 'geojson', data: lineData });
            }

            if (!map.getLayer(layerId)) {
                map.addLayer({
                    id: layerId,
                    type: 'line',
                    source: sourceId,
                    paint: {
                        'line-color': '#c8a050',
                        'line-width': 6,
                        'line-opacity': 0.7,
                    },
                    layout: {
                        'line-cap': 'round',
                        'line-join': 'round',
                    },
                });
            }
        };

        if (!map.isStyleLoaded()) {
            map.once('load', applyRouteLayer);
            return;
        }
        applyRouteLayer();
    }, [polylinePositions]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !routeData) {
            return;
        }

        spotMarkersRef.current.forEach((marker) => marker.remove());
        spotMarkersRef.current = [];

        const nextMarkers = routeData.cinematic_spots
            .filter((spot) => spot.latitude && spot.longitude)
            .map((spot) => {
                const markerElement = document.createElement('div');
                markerElement.className = 'guide-spot-marker';
                markerElement.innerHTML = '<span>📸</span>';

                const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
                    `<div class="guide-spot-popup"><strong>${escapeHtml(spot.location_name ?? 'スポット')}</strong></div>`
                );

                return new maplibregl.Marker({
                    element: markerElement,
                    anchor: 'bottom',
                }).setLngLat([spot.longitude!, spot.latitude!]).setPopup(popup).addTo(map);
            });

        spotMarkersRef.current = nextMarkers;
    }, [routeData]);

    // Simple nearest spot calculation
    const nearestSpot = routeData?.cinematic_spots[0]; // For MVP, just show the first spot

    const formatPhotoTime = (value: string | null | undefined) => {
        if (!value) {
            return null;
        }

        return new Intl.DateTimeFormat('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
            timeZone: 'Asia/Tokyo',
        }).format(new Date(value));
    };

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
                <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
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
                        {(nearestSpot.sun_angle_data?.best_photo_window_label || nearestSpot.best_photo_time) && (
                            <div className="hud-photo-window">
                                撮りどき:
                                {' '}
                                {nearestSpot.sun_angle_data?.best_photo_window_label ?? formatPhotoTime(nearestSpot.best_photo_time)}
                                {nearestSpot.sun_angle_data?.best_photo_window_reason && ` ${nearestSpot.sun_angle_data.best_photo_window_reason}`}
                            </div>
                        )}
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
