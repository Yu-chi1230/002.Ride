import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContactPage from '../../pages/ContactPage';

const {
    mockApiFetch,
    mockNavigate,
    mockUseAuth,
} = vi.hoisted(() => ({
    mockApiFetch: vi.fn(),
    mockNavigate: vi.fn(),
    mockUseAuth: vi.fn(),
}));

vi.mock('../lib/api', () => ({
    apiFetch: mockApiFetch,
}));

vi.mock('../contexts/AuthContext', () => ({
    useAuth: mockUseAuth,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

function renderContactPage() {
    return render(
        <MemoryRouter initialEntries={['/settings/contact']}>
            <ContactPage />
        </MemoryRouter>
    );
}

describe('ContactPage', () => {
    beforeEach(() => {
        mockApiFetch.mockReset();
        mockNavigate.mockReset();
        mockUseAuth.mockReturnValue({
            user: { id: 'user-1', email: 'rider@example.com' },
        });
        mockApiFetch.mockResolvedValue({ ok: true });
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
    });

    it('CP-UT-001 必須項目不足時は送信せずエラーを表示する', async () => {
        const user = userEvent.setup();
        renderContactPage();

        expect(screen.queryByLabelText('お名前（任意）')).not.toBeInTheDocument();
        await user.clear(screen.getByLabelText('メールアドレス'));
        await user.clear(screen.getByLabelText('件名'));
        await user.clear(screen.getByLabelText('内容'));
        fireEvent.submit(screen.getByRole('button', { name: '送信する' }).closest('form')!);

        expect(await screen.findByText('メールアドレスを入力してください。')).toBeInTheDocument();
        expect(screen.getByText('件名を入力してください。')).toBeInTheDocument();
        expect(screen.getByText('内容を入力してください。')).toBeInTheDocument();
        expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('CP-UT-003 画面表示時にページ先頭へスクロールする', () => {
        const rootElement = document.createElement('div');
        rootElement.scrollTop = 240;
        const getElementByIdSpy = vi.spyOn(document, 'getElementById').mockImplementation((id: string) => {
            if (id === 'root') {
                return rootElement;
            }
            return null;
        });

        renderContactPage();

        expect(getElementByIdSpy).toHaveBeenCalledWith('root');
        expect(rootElement.scrollTop).toBe(0);
    });

    it('CP-UT-002 正常送信時は /api/contact に送信し成功モーダルを出した後に /settings へ遷移する', async () => {
        const user = userEvent.setup();
        renderContactPage();

        await user.type(screen.getByLabelText('件名'), 'アプリの挙動について');
        await user.type(screen.getByLabelText('内容'), 'Explore画面でルート検索時に確認したい点があります。');
        fireEvent.submit(screen.getByRole('button', { name: '送信する' }).closest('form')!);

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledTimes(1);
        });

        const [endpoint, options] = mockApiFetch.mock.calls[0];
        const body = JSON.parse(options.body);

        expect(endpoint).toBe('/api/contact');
        expect(options.method).toBe('POST');
        expect(body).toEqual({
            email: 'rider@example.com',
            category: 'question',
            subject: 'アプリの挙動について',
            message: 'Explore画面でルート検索時に確認したい点があります。',
            metadata: expect.objectContaining({
                userId: 'user-1',
                route: '/settings/contact',
                locale: expect.any(String),
                timezone: expect.any(String),
                ua: expect.any(String),
                screen: expect.stringContaining('x'),
            }),
        });
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '送信完了' })).toBeInTheDocument();
        expect(screen.getByText('送信しました。返信が必要な場合は入力したメールに連絡します。')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: '閉じる' }));

        expect(mockNavigate).toHaveBeenCalledWith('/settings', { state: { scrollToTop: true } });
    });
});
