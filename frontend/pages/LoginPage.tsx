import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import './LoginPage.css';

const GoogleIcon = () => (
    <svg className="login-google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
);

function LoginPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleGoogleLogin = async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    // Redirect back to app after login - in production this would be the actual domain
                    redirectTo: `${window.location.origin}/home`
                }
            });
            if (error) {
                console.error('Google login error:', error.message);
                setErrorMsg('Googleログインに失敗しました。');
            }
        } catch (error: any) {
            console.error('Google login error:', error);
            setErrorMsg('エラーが発生しました。もう一度お試しください。');
        }
    };

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');

        if (!email.trim() || !password.trim()) {
            setErrorMsg('メールアドレスとパスワードを入力してください。');
            return;
        }

        setIsLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password.trim(),
            });

            if (error) {
                // Supabase returns specific error messages that might signify wrong password or user not found
                setErrorMsg('メールアドレスまたはパスワードが間違っています。');
                return;
            }

            if (data.user) {
                console.log('Login Success:', data.user.email);
                // navigate('/home') is no longer strictly needed here if wrapped in AuthRoute
                // because AuthRoute will detect the user and redirect automatically.
                // But we leave it for immediate UX confirmation.
                // Actually, letting AuthRoute handle it is cleaner and avoids navigation race conditions.
            }
        } catch (error: any) {
            console.error('Login Error:', error);
            setErrorMsg('エラーが発生しました。もう一度お試しください。');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-page">
            {/* Cinematic Background */}
            <div className="login-bg" />

            {/* Floating Particles */}
            <div className="login-particles">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="login-particle" />
                ))}
            </div>

            {/* Main Content */}
            <div className="login-content">
                <h1 className="login-logo">
                    <span className="login-logo-accent">r</span>ide
                </h1>

                <div className="login-line" />

                <p className="login-tagline">
                    あなたの愛車を、映画にする。
                </p>

                <button
                    id="google-login-btn"
                    className="login-google-btn"
                    onClick={handleGoogleLogin}
                    type="button"
                >
                    <GoogleIcon />
                    Google でログイン
                </button>

                <div className="login-divider">
                    <span className="login-divider-text">または</span>
                </div>

                <form className="login-form" onSubmit={handleEmailLogin}>
                    <input
                        type="email"
                        className="login-input"
                        placeholder="メールアドレス"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        className="login-input"
                        placeholder="パスワード"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    {errorMsg && <div className="login-error-msg">{errorMsg}</div>}
                    <button
                        type="submit"
                        className="login-submit-btn"
                        disabled={isLoading}
                    >
                        {isLoading ? 'ログイン中...' : 'ログイン'}
                    </button>

                    <div className="login-signup-prompt">
                        <span className="login-signup-text">アカウントをお持ちでないですか？</span>
                        <button
                            type="button"
                            className="login-signup-link"
                            onClick={() => navigate('/onboarding')}
                        >
                            アカウント作成はこちらから
                        </button>
                    </div>
                </form>
            </div>

            {/* Footer */}
            <footer className="login-footer">
                © 2026 ride — All rights reserved.
            </footer>
        </div>
    );
}

export default LoginPage;
