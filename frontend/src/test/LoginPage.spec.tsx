import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import LoginPage from '../../pages/LoginPage';

const {
    mockNavigate,
    mockSignInWithOAuth,
    mockSetSession,
    mockApiFetch,
} = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockSignInWithOAuth: vi.fn(),
    mockSetSession: vi.fn(),
    mockApiFetch: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: {
            signInWithOAuth: mockSignInWithOAuth,
            setSession: mockSetSession,
        },
    },
}));

vi.mock('../lib/api', () => ({
    apiFetch: mockApiFetch,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

function renderLoginPage() {
    return render(
        <MemoryRouter>
            <LoginPage />
        </MemoryRouter>
    );
}

describe('LoginPage', () => {
    beforeEach(() => {
        mockNavigate.mockReset();
        mockSignInWithOAuth.mockReset();
        mockSetSession.mockReset();
        mockApiFetch.mockReset();
        mockSetSession.mockResolvedValue({ error: null });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
    });

    it('LP-UT-001 初期表示: 主要 UI が表示される', () => {
        renderLoginPage();

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ride');
        expect(screen.getByText('あなたの愛車を、映画にする。')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Google でログイン' })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('メールアドレス')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('パスワード')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument();
    });

    it('LP-UT-002 初期状態: エラー非表示、パスワード非表示、送信ボタン活性で開始する', () => {
        renderLoginPage();

        expect(screen.queryByText('メールアドレスまたはパスワードが間違っています。')).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText('パスワード')).toHaveAttribute('type', 'password');
        expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled();
    });

    it('LP-UT-003 パスワード表示切替: トグルで type が切り替わる', async () => {
        const user = userEvent.setup();
        renderLoginPage();

        const passwordInput = screen.getByPlaceholderText('パスワード');
        const toggleButton = screen.getByRole('button', { name: 'パスワードを表示する' });

        await user.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'text');

        await user.click(screen.getByRole('button', { name: 'パスワードを隠す' }));
        expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('LP-UT-004 未入力バリデーション: API を呼ばずエラー表示する', () => {
        renderLoginPage();

        fireEvent.submit(screen.getByRole('button', { name: 'ログイン' }).closest('form')!);

        expect(screen.getByText('メールアドレスとパスワードを入力してください。')).toBeInTheDocument();
        expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it.each([
        'abc123',
        'abcdefgh',
        '12345678',
    ])('LP-UT-005 パスワード形式バリデーション: %s は不正形式として弾く', async (password) => {
        const user = userEvent.setup();
        renderLoginPage();

        await user.type(screen.getByPlaceholderText('メールアドレス'), 'test@example.com');
        await user.type(screen.getByPlaceholderText('パスワード'), password);
        fireEvent.submit(screen.getByRole('button', { name: 'ログイン' }).closest('form')!);

        expect(screen.getByText('パスワードは8文字以上で、英字と数字をそれぞれ1文字以上含める必要があります。')).toBeInTheDocument();
        expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('LP-UT-006 入力 trim: 前後空白を除去して API に渡す', async () => {
        const user = userEvent.setup();
        mockApiFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({
                session: {
                    access_token: 'access-token',
                    refresh_token: 'refresh-token',
                    user: { email: 'test@example.com' },
                },
            }),
        });
        renderLoginPage();

        await user.type(screen.getByPlaceholderText('メールアドレス'), '  test@example.com  ');
        await user.type(screen.getByPlaceholderText('パスワード'), '  abc12345  ');
        fireEvent.submit(screen.getByRole('button', { name: 'ログイン' }).closest('form')!);

        await waitFor(() => {
            expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'test@example.com',
                    password: 'abc12345',
                }),
            }, null);
        });
    });

    it('LP-UT-007 メールログイン正常系: 正しい引数で 1 回呼び、ローディング表示が戻る', async () => {
        const user = userEvent.setup();
        let resolveLogin: (value: any) => void = () => {};
        mockApiFetch.mockReturnValue(new Promise((resolve) => {
            resolveLogin = resolve;
        }));
        renderLoginPage();

        await user.type(screen.getByPlaceholderText('メールアドレス'), 'test@example.com');
        await user.type(screen.getByPlaceholderText('パスワード'), 'abc12345');
        fireEvent.submit(screen.getByRole('button', { name: 'ログイン' }).closest('form')!);

        expect(screen.getByRole('button', { name: 'ログイン中...' })).toBeDisabled();

        resolveLogin({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({
                session: {
                    access_token: 'access-token',
                    refresh_token: 'refresh-token',
                    user: { email: 'test@example.com' },
                },
            }),
        });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled();
        });
        expect(mockApiFetch).toHaveBeenCalledTimes(1);
        expect(mockSetSession).toHaveBeenCalledWith({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
        });
        expect(screen.queryByText('メールアドレスまたはパスワードが間違っています。')).not.toBeInTheDocument();
    });

    it('LP-UT-008 メールログイン認証失敗: 専用メッセージを表示する', async () => {
        const user = userEvent.setup();
        mockApiFetch.mockResolvedValue({
            ok: false,
            status: 401,
            json: vi.fn().mockResolvedValue({
                error: 'メールアドレスまたはパスワードが間違っています。',
            }),
        });
        renderLoginPage();

        await user.type(screen.getByPlaceholderText('メールアドレス'), 'test@example.com');
        await user.type(screen.getByPlaceholderText('パスワード'), 'abc12345');
        fireEvent.submit(screen.getByRole('button', { name: 'ログイン' }).closest('form')!);

        expect(await screen.findByText('メールアドレスまたはパスワードが間違っています。')).toBeInTheDocument();
        expect(mockSetSession).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled();
    });

    it('LP-UT-008b メールログインロック: 429 でロック文言を表示する', async () => {
        const user = userEvent.setup();
        mockApiFetch.mockResolvedValue({
            ok: false,
            status: 429,
            json: vi.fn().mockResolvedValue({
                retryAfterSeconds: 600,
            }),
        });
        renderLoginPage();

        await user.type(screen.getByPlaceholderText('メールアドレス'), 'test@example.com');
        await user.type(screen.getByPlaceholderText('パスワード'), 'abc12345');
        fireEvent.submit(screen.getByRole('button', { name: 'ログイン' }).closest('form')!);

        expect(await screen.findByText('ログイン試行回数の上限に達しました。10分後に再試行してください。')).toBeInTheDocument();
        expect(mockSetSession).not.toHaveBeenCalled();
    });

    it('LP-UT-009 メールログイン例外: 汎用エラーメッセージを表示する', async () => {
        const user = userEvent.setup();
        mockApiFetch.mockRejectedValue(new Error('network error'));
        renderLoginPage();

        await user.type(screen.getByPlaceholderText('メールアドレス'), 'test@example.com');
        await user.type(screen.getByPlaceholderText('パスワード'), 'abc12345');
        fireEvent.submit(screen.getByRole('button', { name: 'ログイン' }).closest('form')!);

        expect(await screen.findByText('エラーが発生しました。もう一度お試しください。')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled();
    });

    it('LP-UT-010 ログイン中表示: 送信中はボタンが disabled になり文言が変わる', async () => {
        const user = userEvent.setup();
        mockApiFetch.mockReturnValue(new Promise(() => {}));
        renderLoginPage();

        await user.type(screen.getByPlaceholderText('メールアドレス'), 'test@example.com');
        await user.type(screen.getByPlaceholderText('パスワード'), 'abc12345');
        fireEvent.submit(screen.getByRole('button', { name: 'ログイン' }).closest('form')!);

        expect(screen.getByRole('button', { name: 'ログイン中...' })).toBeDisabled();
    });

    it('LP-UT-011 Google ログイン正常系: provider と redirectTo が正しい', async () => {
        const user = userEvent.setup();
        mockSignInWithOAuth.mockResolvedValue({ error: null });
        renderLoginPage();

        await user.click(screen.getByRole('button', { name: 'Google でログイン' }));

        expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1);
        expect(mockSignInWithOAuth).toHaveBeenCalledWith({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/home`,
            },
        });
        expect(screen.queryByText('Googleログインに失敗しました。')).not.toBeInTheDocument();
    });

    it('LP-UT-012 Google ログイン失敗応答: 専用メッセージを表示する', async () => {
        const user = userEvent.setup();
        mockSignInWithOAuth.mockResolvedValue({ error: { message: 'oauth failed' } });
        renderLoginPage();

        await user.click(screen.getByRole('button', { name: 'Google でログイン' }));

        expect(await screen.findByText('Googleログインに失敗しました。')).toBeInTheDocument();
    });

    it('LP-UT-013 Google ログイン例外: 汎用エラーメッセージを表示する', async () => {
        const user = userEvent.setup();
        mockSignInWithOAuth.mockRejectedValue(new Error('unexpected'));
        renderLoginPage();

        await user.click(screen.getByRole('button', { name: 'Google でログイン' }));

        expect(await screen.findByText('エラーが発生しました。もう一度お試しください。')).toBeInTheDocument();
    });

    it('LP-UT-014 エラークリア: 再送信時に古いエラーが消える', async () => {
        const user = userEvent.setup();
        mockApiFetch
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: vi.fn().mockResolvedValue({ error: 'メールアドレスまたはパスワードが間違っています。' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue({
                    session: {
                        access_token: 'access-token',
                        refresh_token: 'refresh-token',
                        user: { email: 'test@example.com' },
                    },
                }),
            });
        renderLoginPage();

        await user.type(screen.getByPlaceholderText('メールアドレス'), 'test@example.com');
        await user.type(screen.getByPlaceholderText('パスワード'), 'abc12345');
        fireEvent.submit(screen.getByRole('button', { name: 'ログイン' }).closest('form')!);

        expect(await screen.findByText('メールアドレスまたはパスワードが間違っています。')).toBeInTheDocument();

        fireEvent.submit(screen.getByRole('button', { name: 'ログイン' }).closest('form')!);

        await waitFor(() => {
            expect(screen.queryByText('メールアドレスまたはパスワードが間違っています。')).not.toBeInTheDocument();
        });
    });

    it('LP-UT-015 サインアップ導線: /onboarding へ遷移要求する', async () => {
        const user = userEvent.setup();
        renderLoginPage();

        await user.click(screen.getByRole('button', { name: 'アカウント作成はこちらから' }));

        expect(mockNavigate).toHaveBeenCalledWith('/onboarding');
    });
});
