import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExplorePage from '../../pages/ExplorePage';

const { mockApiFetch } = vi.hoisted(() => ({
    mockApiFetch: vi.fn(),
}));

vi.mock('../../components/BottomNav', () => ({
    default: () => <nav data-testid="bottom-nav" />,
}));

vi.mock('../../components/TouchSlider', () => ({
    default: ({ value }: { value: number }) => (
        <div data-testid="touch-slider">{value}</div>
    ),
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

function setupGeolocation() {
    Object.defineProperty(global.navigator, 'geolocation', {
        configurable: true,
        value: {
            getCurrentPosition: vi.fn((success: PositionCallback) => {
                success({
                    coords: {
                        latitude: 35.6812,
                        longitude: 139.7671,
                        accuracy: 10,
                        altitude: null,
                        altitudeAccuracy: null,
                        heading: null,
                        speed: null,
                    },
                    timestamp: Date.now(),
                } as GeolocationPosition);
            }),
        },
    });
}

function renderExplorePage() {
    return render(
        <MemoryRouter initialEntries={['/explore']}>
            <ExplorePage />
        </MemoryRouter>
    );
}

describe('ExplorePage', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('default_riding_time', '60');
        setupGeolocation();
        vi.spyOn(console, 'error').mockImplementation(() => { });
        mockApiFetch.mockReset();
        mockApiFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                data: {
                    routes: [{
                        route: {
                            id: 'r-1',
                            title: '東京湾ルート',
                            time_limit_minutes: 60,
                            total_distance_km: 24.5,
                        },
                        route_geometry: [],
                        waypoints: [{ latitude: 35.6812, longitude: 139.7671, order_index: 0 }],
                        cinematic_spots: [],
                    }],
                },
            }),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
    });

    it('EXM-UT-001 初期表示: 探索UIが表示される', async () => {
        renderExplorePage();

        expect(await screen.findByText('探索を開始する')).toBeInTheDocument();
        expect(screen.getByText('所要時間')).toBeInTheDocument();
        expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
    });

    it('EXM-UT-002 ルート探索API正常系: 探索開始でAPIが呼ばれる', async () => {
        renderExplorePage();
        const user = userEvent.setup();

        const searchButton = await screen.findByRole('button', { name: '探索を開始する' });
        await user.click(searchButton);

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/api/explore/routes', expect.objectContaining({
                method: 'POST',
                timeoutMs: 60000,
            }));
        });

        const payload = JSON.parse(mockApiFetch.mock.calls[0][1].body);
        expect(payload).toMatchObject({
            time_limit_minutes: 60,
            latitude: 35.6812,
            longitude: 139.7671,
        });

        expect(await screen.findByText('1件のルートが見つかりました')).toBeInTheDocument();
    });

    it('EXM-UT-003 探索失敗時の状態復帰: API失敗後に再操作可能', async () => {
        mockApiFetch.mockResolvedValueOnce({
            ok: false,
            json: vi.fn(),
        });

        renderExplorePage();
        const user = userEvent.setup();

        const searchButton = await screen.findByRole('button', { name: '探索を開始する' });
        await user.click(searchButton);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '探索を開始する' })).toBeEnabled();
        });
    });
});
