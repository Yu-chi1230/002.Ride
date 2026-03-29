import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExploreGuidePage from '../../pages/ExploreGuidePage';

const { mockApiFetch } = vi.hoisted(() => ({
    mockApiFetch: vi.fn(),
}));

vi.mock('../../src/lib/api', () => ({
    apiFetch: mockApiFetch,
}));

vi.mock('maplibre-gl', () => {
    class MapMock {
        private sources = new Map<string, { setData: (data: unknown) => void }>();
        private layers = new Set<string>();

        constructor(_: unknown) { }

        addControl() { return this; }

        on(event: string, cb: () => void) {
            if (event === 'load') cb();
            return this;
        }

        once(event: string, cb: () => void) {
            if (event === 'load') cb();
            return this;
        }

        getStyle() {
            return { layers: [{ id: 'road-label', type: 'symbol' }] };
        }

        getLayoutProperty() {
            return ['get', 'name'];
        }

        setLayoutProperty() { }
        setPaintProperty() { }
        easeTo() { }
        remove() { }
        isStyleLoaded() { return true; }

        getSource(id: string) {
            return this.sources.get(id);
        }

        addSource(id: string) {
            this.sources.set(id, { setData: () => { } });
        }

        getLayer(id: string) {
            return this.layers.has(id) ? { id } : undefined;
        }

        addLayer(layer: { id: string }) {
            this.layers.add(layer.id);
        }
    }

    class MarkerMock {
        setLngLat() { return this; }
        setPopup() { return this; }
        addTo() { return this; }
        remove() { return this; }
    }

    class PopupMock {
        setHTML() { return this; }
    }

    class NavigationControlMock { }

    return {
        default: {
            Map: MapMock,
            Marker: MarkerMock,
            Popup: PopupMock,
            NavigationControl: NavigationControlMock,
        },
    };
});

function renderGuidePage() {
    return render(
        <MemoryRouter initialEntries={['/explore/guide/route-1']}>
            <Routes>
                <Route path="/explore/guide/:routeId" element={<ExploreGuidePage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('ExploreGuidePage', () => {
    beforeEach(() => {
        mockApiFetch.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => { });
        mockApiFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                data: {
                    route: {
                        id: 'route-1',
                        title: '阿蘇ライン',
                        time_limit_minutes: 60,
                        total_distance_km: 32.5,
                    },
                    route_geometry: [
                        { latitude: 32.8, longitude: 130.7, order_index: 0 },
                        { latitude: 32.81, longitude: 130.71, order_index: 1 },
                    ],
                    waypoints: [],
                    cinematic_spots: [{
                        location_name: '撮影スポットA',
                        shooting_guide: '逆光を狙う',
                        best_photo_time: null,
                        sun_angle_data: null,
                        latitude: 32.81,
                        longitude: 130.71,
                    }],
                },
            }),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
    });

    it('EXM-UT-004 Guide詳細取得成功: API呼び出し後にHUDが表示される', async () => {
        Object.defineProperty(global.navigator, 'geolocation', {
            configurable: true,
            value: {
                watchPosition: vi.fn(),
                clearWatch: vi.fn(),
            },
        });

        renderGuidePage();

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/api/explore/routes/route-1', { method: 'GET' });
        });
        expect(await screen.findByText('NEXT CINEMATIC SPOT')).toBeInTheDocument();
        expect(screen.getByText('撮影スポットA')).toBeInTheDocument();
    });

    it('EXM-UT-006 Guideクリーンアップ: アンマウントでclearWatchが呼ばれる', async () => {
        const watchPosition = vi.fn((_success: PositionCallback) => 99);
        const clearWatch = vi.fn();
        Object.defineProperty(global.navigator, 'geolocation', {
            configurable: true,
            value: { watchPosition, clearWatch },
        });

        const view = renderGuidePage();
        await screen.findByText('NEXT CINEMATIC SPOT');

        view.unmount();
        expect(clearWatch).toHaveBeenCalledWith(99);
    });

    it('EXM-UT-005 Guide詳細取得失敗: エラーメッセージを表示する', async () => {
        Object.defineProperty(global.navigator, 'geolocation', {
            configurable: true,
            value: {
                watchPosition: vi.fn(),
                clearWatch: vi.fn(),
            },
        });
        mockApiFetch.mockResolvedValueOnce({
            ok: false,
            json: vi.fn(),
        });

        renderGuidePage();
        expect(await screen.findByText('ルート情報の取得に失敗しました。')).toBeInTheDocument();
    });
});
