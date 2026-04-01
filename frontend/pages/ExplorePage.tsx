import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import maplibregl, { GeoJSONSource } from 'maplibre-gl';
import BottomNav from '../components/BottomNav';
import TouchSlider from '../components/TouchSlider';
import { apiFetch } from '../src/lib/api';
import 'maplibre-gl/dist/maplibre-gl.css';
import './ExplorePage.css';

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
        light_phase?: string;
        best_photo_window_label?: string;
        best_photo_window_reason?: string;
        preferred_light_direction?: 'front_light' | 'back_light' | 'side_light';
    } | null;
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
    route_geometry?: RouteGeometryPoint[];
    waypoints: WaypointData[];
    cinematic_spots: CinematicSpotData[];
};

// ===== タイムプリセット =====
const TIME_PRESETS = [
    { label: '00:30', value: 30 },
    { label: '05:00', value: 300 },
];

const REACHABLE_AREA_AVERAGE_SPEED_KMH = 32;
const REACHABLE_AREA_RETURN_MARGIN = 0.62;
const REACHABLE_AREA_POINT_COUNT = 36;
const EXPLORE_ROUTE_TIMEOUT_MS = 60000;
const MAP_STYLE_URL =
    import.meta.env.VITE_MAP_STYLE_URL ||
    (import.meta.env.VITE_MAPTILER_KEY
        ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${import.meta.env.VITE_MAPTILER_KEY}`
        : 'https://tiles.openfreemap.org/styles/liberty');

const buildReachableAreaPolygon = (center: { lat: number; lng: number }, minutes: number): [number, number][] => {
    const reachableDistanceKm =
        (minutes / 60) * REACHABLE_AREA_AVERAGE_SPEED_KMH * REACHABLE_AREA_RETURN_MARGIN;
    const latRadius = reachableDistanceKm / 111;
    const lngRadius = reachableDistanceKm / (111 * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.2));

    return Array.from({ length: REACHABLE_AREA_POINT_COUNT }, (_, index) => {
        const theta = (Math.PI * 2 * index) / REACHABLE_AREA_POINT_COUNT;
        const eastBias = Math.max(0, Math.cos(theta));
        const northBias = Math.max(0, Math.sin(theta));
        const ripple = 1 + (Math.sin(theta * 3) * 0.08) + (Math.cos(theta * 2) * 0.05);
        const radiusScale = ripple * (1 + eastBias * 0.18 + northBias * 0.08);

        return [
            center.lat + Math.sin(theta) * latRadius * radiusScale,
            center.lng + Math.cos(theta) * lngRadius * radiusScale,
        ];
    });
};

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

const getCompassLabel = (azimuth: number) => {
    const directions = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
    return directions[Math.round((((azimuth % 360) + 360) % 360) / 45) % directions.length];
};

const getLightPhaseLabel = (phase: string | null | undefined) => {
    switch (phase) {
        case 'hard_daylight':
            return '硬い日中光';
        case 'daylight':
            return '日中の自然光';
        case 'low_angle_light':
            return '低い斜光';
        case 'blue_hour':
            return 'ブルーアワー';
        case 'night':
            return '夜間光';
        default:
            return '現在の光';
    }
};

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

// ===== メインコンポーネント =====
function ExplorePage() {
    const navigate = useNavigate();
    const location = useLocation();

    // 状態管理
    const [timeLimit, setTimeLimit] = useState(() => parseInt(localStorage.getItem('default_riding_time') || '60', 10));
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [locationError, setLocationError] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(null);
    const [routeResults, setRouteResults] = useState<RouteResult[] | null>(null);
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
    const [isPredefinedRoute, setIsPredefinedRoute] = useState(false);
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const spotMarkersRef = useRef<maplibregl.Marker[]>([]);

    // Provide pre-defined route via location state
    useEffect(() => {
        if (location.state && location.state.predefinedRoute) {
            const preRoute = location.state.predefinedRoute;
            setTimeLimit(preRoute.time_limit_minutes);
            // Expected format map, handles any slight differences
            const formattedResult: RouteResult = {
                route: {
                    id: preRoute.id,
                    title: preRoute.title,
                    time_limit_minutes: preRoute.time_limit_minutes,
                    total_distance_km: preRoute.total_distance_km,
                },
                route_geometry: preRoute.route_geometry || [],
                waypoints: preRoute.waypoints || [],
                cinematic_spots: preRoute.cinematic_spots || [],
            };
            setRouteResults([formattedResult]);
            setSelectedRouteIndex(0);
            setIsPredefinedRoute(true);

            if (preRoute.waypoints && preRoute.waypoints.length > 0) {
                const firstWp = preRoute.waypoints[0];
                setUserLocation({ lat: firstWp.latitude, lng: firstWp.longitude });
            }

            // Clear state so reload doesn't keep it forever
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

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
    const handleSearch = async (nextTimeLimit = timeLimit) => {
        if (!userLocation) return;
        setIsSearching(true);
        setSearchErrorMessage(null);
        try {
            const res = await apiFetch('/api/explore/routes', {
                method: 'POST',
                body: JSON.stringify({
                    time_limit_minutes: nextTimeLimit,
                    latitude: userLocation.lat,
                    longitude: userLocation.lng,
                }),
                timeoutMs: EXPLORE_ROUTE_TIMEOUT_MS,
            });
            if (res.ok) {
                const json = await res.json();
                setRouteResults(json.data.routes || []);
                setSelectedRouteIndex(0);
                setIsPredefinedRoute(false);
            } else {
                const errorData = await res.json().catch(() => null);
                setSearchErrorMessage(errorData?.error || 'ルート生成に失敗しました。時間をおいて再度お試しください。');
                console.error('Route search failed:', res.status);
            }
        } catch (err) {
            setSearchErrorMessage('通信エラーが発生しました。接続を確認して再度お試しください。');
            console.error('Route search error:', err);
        } finally {
            setIsSearching(false);
        }
    };

    // ===== ルートのポリライン座標 =====
    const polylinePositions: [number, number][] =
        (activeRouteResult?.route_geometry && activeRouteResult.route_geometry.length > 0
            ? activeRouteResult.route_geometry
            : activeRouteResult?.waypoints)
            ?.sort((a, b) => a.order_index - b.order_index)
            .map((wp) => [wp.latitude, wp.longitude]) ?? [];

    const reachableAreaPositions = userLocation
        ? buildReachableAreaPolygon(userLocation, timeLimit)
        : [];
    const leadSpotSun = activeRouteResult?.cinematic_spots.find((spot) => spot.sun_angle_data?.azimuth !== undefined)?.sun_angle_data ?? null;

    useEffect(() => {
        if (!userLocation || !mapContainerRef.current || mapRef.current) {
            return;
        }

        const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style: MAP_STYLE_URL,
            center: [userLocation.lng, userLocation.lat],
            zoom: 11,
            attributionControl: false,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        map.on('load', () => applyJapaneseLabelPreference(map));
        mapRef.current = map;

        return () => {
            spotMarkersRef.current.forEach((marker) => marker.remove());
            spotMarkersRef.current = [];
            map.remove();
            mapRef.current = null;
        };
    }, [userLocation]);

    useEffect(() => {
        if (!mapRef.current || !userLocation) {
            return;
        }
        mapRef.current.easeTo({
            center: [userLocation.lng, userLocation.lat],
            duration: 700,
        });
    }, [userLocation]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) {
            return;
        }

        const applyLayers = () => {
            const areaCoordinates = reachableAreaPositions.map(([lat, lng]) => [lng, lat]);
            const closedAreaCoordinates =
                areaCoordinates.length > 2
                    ? [...areaCoordinates, areaCoordinates[0]]
                    : [];
            const areaSourceData: GeoJSON.FeatureCollection = {
                type: 'FeatureCollection',
                features: closedAreaCoordinates.length > 0
                    ? [{
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'Polygon',
                            coordinates: [closedAreaCoordinates],
                        },
                    }]
                    : [],
            };

            const routeCoordinates = polylinePositions.map(([lat, lng]) => [lng, lat]);
            const routeSourceData: GeoJSON.FeatureCollection = {
                type: 'FeatureCollection',
                features: routeCoordinates.length > 1
                    ? [{
                        type: 'Feature',
                        properties: {},
                        geometry: {
                            type: 'LineString',
                            coordinates: routeCoordinates,
                        },
                    }]
                    : [],
            };

            const upsertSource = (sourceId: string, data: GeoJSON.FeatureCollection) => {
                const source = map.getSource(sourceId) as GeoJSONSource | undefined;
                if (source) {
                    source.setData(data);
                    return;
                }
                map.addSource(sourceId, { type: 'geojson', data });
            };

            upsertSource('reachable-area-source', areaSourceData);
            upsertSource('route-line-source', routeSourceData);

            if (!map.getLayer('reachable-area-fill')) {
                map.addLayer({
                    id: 'reachable-area-fill',
                    type: 'fill',
                    source: 'reachable-area-source',
                    paint: {
                        'fill-color': '#D4AF37',
                        'fill-opacity': 0.12,
                    },
                });
            }
            if (!map.getLayer('reachable-area-outline')) {
                map.addLayer({
                    id: 'reachable-area-outline',
                    type: 'line',
                    source: 'reachable-area-source',
                    paint: {
                        'line-color': '#D4AF37',
                        'line-width': 2,
                        'line-opacity': 0.8,
                    },
                });
            }
            if (!map.getLayer('reachable-area-glow')) {
                map.addLayer({
                    id: 'reachable-area-glow',
                    type: 'line',
                    source: 'reachable-area-source',
                    paint: {
                        'line-color': '#F6E7A1',
                        'line-width': 8,
                        'line-opacity': 0.08,
                    },
                });
            }
            if (!map.getLayer('route-line')) {
                map.addLayer({
                    id: 'route-line',
                    type: 'line',
                    source: 'route-line-source',
                    paint: {
                        'line-color': '#D4AF37',
                        'line-width': 3,
                        'line-opacity': 0.8,
                    },
                });
            }
        };

        if (!map.isStyleLoaded()) {
            map.once('load', applyLayers);
            return;
        }
        applyLayers();
    }, [reachableAreaPositions, polylinePositions]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) {
            return;
        }

        spotMarkersRef.current.forEach((marker) => marker.remove());
        spotMarkersRef.current = [];

        if (!activeRouteResult) {
            return;
        }

        const nextMarkers = activeRouteResult.cinematic_spots
            .filter((spot) => spot.latitude && spot.longitude)
            .map((spot) => {
                const markerElement = document.createElement('div');
                markerElement.className = 'explore-spot-marker';

                const safeName = escapeHtml(spot.location_name ?? 'スポット');
                const safeGuide = escapeHtml(spot.shooting_guide ?? '');
                const popup = new maplibregl.Popup({ offset: 12 }).setHTML(
                    `<div class="explore-spot-popup"><strong>${safeName}</strong>${safeGuide ? `<div>${safeGuide}</div>` : ''}</div>`
                );

                return new maplibregl.Marker({ element: markerElement, anchor: 'center' })
                    .setLngLat([spot.longitude!, spot.latitude!])
                    .setPopup(popup)
                    .addTo(map);
            });

        spotMarkersRef.current = nextMarkers;
    }, [activeRouteResult]);


    // ===== 時間のフォーマット（表示用） =====
    const formatTime = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return { value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, unit: '' };
    };

    const timeDisplay = formatTime(timeLimit);

    const handleCloseResult = () => {
        setRouteResults(null);
        setSelectedRouteIndex(0);
        setIsPredefinedRoute(false);
        setSearchErrorMessage(null);
    };

    const handleTimeCommit = (nextTimeLimit: number) => {
        if (routeResults && !isSearching) {
            void handleSearch(nextTimeLimit);
        }
    };

    const handlePresetSelect = (nextTimeLimit: number) => {
        setTimeLimit(nextTimeLimit);
        if (routeResults && !isSearching) {
            void handleSearch(nextTimeLimit);
        }
    };

    return (
        <div className="explore-page">
            {/* ===== 地図 ===== */}
            {userLocation && (
                <div className="explore-map-container">
                    <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
                </div>
            )}

            {leadSpotSun?.azimuth !== undefined && (
                <div className="sun-direction-hud">
                    <div className="sun-direction-badge">
                        <div
                            className="sun-direction-dial"
                            aria-label={`太陽方位 ${Math.round(leadSpotSun.azimuth)} 度`}
                        >
                            <div className="sun-direction-ring" />
                            <div className="sun-direction-north">N</div>
                            <div
                                className="sun-direction-icon"
                                style={{ transform: `rotate(${leadSpotSun.azimuth}deg)` }}
                                aria-hidden="true"
                            >
                                <span className="sun-core">☀</span>
                                <span className="sun-beam" />
                            </div>
                        </div>
                        <div className="sun-direction-copy">
                            <div className="sun-direction-label">LIGHT VECTOR</div>
                            <div className="sun-direction-value">{getCompassLabel(leadSpotSun.azimuth)}</div>
                            <div className="sun-direction-meta">
                                {getLightPhaseLabel(leadSpotSun.light_phase)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== ヘッダー ===== */}
            <div className="explore-header">
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
                        <div className="time-selector-label">所要時間</div>
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
                            onChangeEnd={handleTimeCommit}
                        />
                        <div className="time-presets">
                            {TIME_PRESETS.map((p) => (
                                <span
                                    key={p.value}
                                    className={`time-preset-label ${timeLimit === p.value ? 'active' : ''}`}
                                    onClick={() => handlePresetSelect(p.value)}
                                >
                                    {p.label}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="reachable-area-summary">
                        <span className="reachable-area-summary-label">到達可能範囲</span>
                        <span className="reachable-area-summary-value">
                            約{Math.round((timeLimit / 60) * REACHABLE_AREA_AVERAGE_SPEED_KMH * REACHABLE_AREA_RETURN_MARGIN)}km
                        </span>
                    </div>

                    {searchErrorMessage && (
                        <div className="explore-search-error" role="alert">
                            {searchErrorMessage}
                        </div>
                    )}

                    {/* 検索ボタン */}
                    <button
                        className="search-route-btn"
                        onClick={() => void handleSearch()}
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
                        <h2 className="result-title">
                            {isPredefinedRoute ? "おすすめルート" : `${routeResults.length}件のルートが見つかりました`}
                        </h2>
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
                                    {(spot.sun_angle_data?.best_photo_window_label || spot.best_photo_time) && (
                                        <div className="spot-best-time">
                                            おすすめ撮影:
                                            {' '}
                                            {spot.sun_angle_data?.best_photo_window_label ?? formatPhotoTime(spot.best_photo_time)}
                                            {spot.sun_angle_data?.best_photo_window_reason && ` ${spot.sun_angle_data.best_photo_window_reason}`}
                                        </div>
                                    )}
                                    {spot.shooting_guide && (
                                        <div className="spot-guide">{spot.shooting_guide}</div>
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
