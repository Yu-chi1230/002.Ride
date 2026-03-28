import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../../pages/HomePage';

const {
    mockUseAuth,
    mockApiFetch,
    mockNavigate,
    mockSupabaseFrom,
    mockSupabaseSelect,
    mockSupabaseOrder,
} = vi.hoisted(() => ({
    mockUseAuth: vi.fn(),
    mockApiFetch: vi.fn(),
    mockNavigate: vi.fn(),
    mockSupabaseFrom: vi.fn(),
    mockSupabaseSelect: vi.fn(),
    mockSupabaseOrder: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
    useAuth: mockUseAuth,
}));

vi.mock('../lib/api', () => ({
    apiFetch: mockApiFetch,
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: mockSupabaseFrom,
    },
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

function renderHomePage() {
    return render(
        <MemoryRouter initialEntries={['/home']}>
            <HomePage />
        </MemoryRouter>
    );
}

describe('HomePage', () => {
    beforeEach(() => {
        localStorage.clear();

        mockUseAuth.mockReset();
        mockApiFetch.mockReset();
        mockNavigate.mockReset();
        mockSupabaseFrom.mockReset();
        mockSupabaseSelect.mockReset();
        mockSupabaseOrder.mockReset();

        mockUseAuth.mockReturnValue({
            session: { access_token: 'token-123' },
        });

        mockApiFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                data: { route: null },
            }),
        });

        mockSupabaseFrom.mockImplementation(() => ({
            select: mockSupabaseSelect,
        }));
        mockSupabaseSelect.mockImplementation(() => ({
            order: mockSupabaseOrder,
        }));
        mockSupabaseOrder.mockResolvedValue({ data: [], error: null });

        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
    });

    it('HM-UT-001 初期表示: 主要 UI が表示される', async () => {
        const { container } = renderHomePage();

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ride');
        expect(screen.getByText('おすすめルート')).toBeInTheDocument();
        expect(container.querySelector('.notification-icon')).toBeInTheDocument();
        expect(screen.getByRole('navigation')).toBeInTheDocument();

        await waitFor(() => {
            expect(mockSupabaseFrom).toHaveBeenCalledWith('announcements');
        });
    });

    it('HM-UT-002 背景画像適用: localStorage の値が背景 style に反映される', () => {
        localStorage.setItem('home_bg_image', 'https://example.com/bg.jpg');
        localStorage.setItem('home_bg_position_y', '25');

        const { container } = renderHomePage();
        const bg = container.querySelector('.home-bg') as HTMLElement;

        expect(bg.style.backgroundImage).toContain('https://example.com/bg.jpg');
        expect(bg.style.backgroundPosition).toBe('center 25%');
    });

    it('HM-UT-003 背景画像未設定: background style が未設定', () => {
        const { container } = renderHomePage();
        const bg = container.querySelector('.home-bg') as HTMLElement;

        expect(bg.style.backgroundImage).toBe('');
        expect(bg.style.backgroundPosition).toBe('');
    });

    it('HM-UT-004 最新ルートAPI呼び出し条件: session ありでのみ呼び出す', async () => {
        renderHomePage();

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/api/explore/routes/latest', {}, 'token-123');
        });

        mockApiFetch.mockClear();
        mockUseAuth.mockReturnValue({ session: null });
        renderHomePage();

        await waitFor(() => {
            expect(mockSupabaseFrom).toHaveBeenCalled();
        });
        expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('HM-UT-005 最新ルート取得成功表示: タイトル/時間/説明が反映される', async () => {
        mockApiFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                data: {
                    route: {
                        id: 'route-1',
                        title: '阿蘇スカイライン',
                        time_limit_minutes: 90,
                        total_distance_km: 48.2,
                    },
                },
            }),
        });

        renderHomePage();

        expect(await screen.findByText('阿蘇スカイライン')).toBeInTheDocument();
        expect(screen.getByText('⏱ 1h 30m')).toBeInTheDocument();
        expect(screen.getByText('48.2kmのAI推奨ルート')).toBeInTheDocument();
    });

    it('HM-UT-006 最新ルート取得失敗表示: フォールバック文言を表示する', async () => {
        mockApiFetch.mockResolvedValue({ ok: false, json: vi.fn() });

        renderHomePage();

        expect(await screen.findByText('新しいルートを生成')).toBeInTheDocument();
        expect(screen.getByText('ExploreでAIにルートを作成してもらいましょう')).toBeInTheDocument();
    });

    it('HM-UT-008 お知らせ空状態: 0件メッセージを表示する', async () => {
        mockSupabaseOrder.mockResolvedValue({ data: [], error: null });
        const { container } = renderHomePage();

        await waitFor(() => {
            expect(mockSupabaseFrom).toHaveBeenCalledWith('announcements');
        });

        const bell = container.querySelector('.notification-icon') as Element;
        fireEvent.click(bell);

        expect(await screen.findByText('現在新しいお知らせはありません。')).toBeInTheDocument();
    });

    it.each([
        {
            label: 'Supabase が error を返す',
            setup: () => mockSupabaseOrder.mockResolvedValue({ data: null, error: { message: 'db error' } }),
        },
        {
            label: 'Supabase が例外を投げる',
            setup: () => mockSupabaseOrder.mockRejectedValue(new Error('network fail')),
        },
    ])('HM-UT-009 お知らせ取得失敗耐性: $label 場合でも空状態表示で継続する', async ({ setup }) => {
        setup();
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { container } = renderHomePage();

        await waitFor(() => {
            expect(mockSupabaseFrom).toHaveBeenCalledWith('announcements');
        });

        const bell = container.querySelector('.notification-icon') as Element;
        fireEvent.click(bell);

        expect(await screen.findByText('現在新しいお知らせはありません。')).toBeInTheDocument();
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('HM-UT-007 / HM-UT-013 / HM-UT-014 お知らせ表示: 一覧・日付整形・あなたへラベル', async () => {
        mockSupabaseOrder.mockResolvedValue({
            data: [
                {
                    id: 'ann-1',
                    start_date: '2026-03-24T12:00:00.000Z',
                    title: '個別メンテナンス案内',
                    content: '今週末は点検をおすすめします。',
                    is_global: false,
                },
                {
                    id: 'ann-2',
                    start_date: '2026-03-20T12:00:00.000Z',
                    title: '全体メンテナンス情報',
                    content: 'システム更新のお知らせです。',
                    is_global: true,
                },
            ],
            error: null,
        });

        const { container } = renderHomePage();
        const bell = container.querySelector('.notification-icon') as Element;
        fireEvent.click(bell);

        expect(await screen.findByText('個別メンテナンス案内')).toBeInTheDocument();
        expect(screen.getByText('全体メンテナンス情報')).toBeInTheDocument();
        expect(screen.getByText('2026.03.24')).toBeInTheDocument();
        expect(screen.getByText('2026.03.20')).toBeInTheDocument();
        expect(screen.getByText('あなたへ')).toBeInTheDocument();
    });

    it('HM-UT-010 ドロワー開閉: アイコン・オーバーレイ・閉じるボタンで切替', async () => {
        const { container } = renderHomePage();

        await waitFor(() => {
            expect(mockSupabaseFrom).toHaveBeenCalled();
        });

        const drawer = container.querySelector('.nav-drawer') as HTMLElement;
        const overlay = container.querySelector('.drawer-overlay') as HTMLElement;
        const bell = container.querySelector('.notification-icon') as Element;

        fireEvent.click(bell);
        expect(drawer.className).toContain('open');
        expect(overlay.className).toContain('open');

        fireEvent.click(overlay);
        expect(drawer.className).not.toContain('open');
        expect(overlay.className).not.toContain('open');

        fireEvent.click(bell);
        fireEvent.click(container.querySelector('.drawer-close-btn') as Element);
        expect(drawer.className).not.toContain('open');
    });

    it('HM-UT-011 ルートカード遷移(最新あり): predefinedRoute 付きで /explore へ遷移', async () => {
        const latestRoute = {
            id: 'route-99',
            title: '由布院ライン',
            time_limit_minutes: 120,
            total_distance_km: 77.5,
            waypoints: [],
            route_geometry: [],
            cinematic_spots: [],
        };

        mockApiFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ data: { route: latestRoute } }),
        });

        const { container } = renderHomePage();

        await screen.findByText('由布院ライン');
        fireEvent.click(container.querySelector('.route-card') as Element);

        expect(mockNavigate).toHaveBeenCalledWith('/explore', { state: { predefinedRoute: latestRoute } });
    });

    it('HM-UT-012 ルートカード遷移(最新なし): state なしで /explore へ遷移', async () => {
        mockApiFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ data: { route: null } }),
        });

        const { container } = renderHomePage();

        await waitFor(() => {
            expect(screen.getByText('新しいルートを生成')).toBeInTheDocument();
        });

        fireEvent.click(container.querySelector('.route-card') as Element);

        expect(mockNavigate).toHaveBeenCalledWith('/explore');
    });
});
