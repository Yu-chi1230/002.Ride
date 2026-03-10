import { useState } from 'react';
import { supabase } from '../src/lib/supabase';
import { apiFetch } from '../src/lib/api';
import { VEHICLE_MAKERS } from '../src/constants/vehicleMakers';
import ReactMarkdown from 'react-markdown';
import termsText from '@docs/利用規約.md?raw';
import privacyText from '@docs/ride_プライバシーポリシー.md?raw';
import './OnboardingPage.css';

function OnboardingPage() {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        lastName: '',
        firstName: '',
        displayName: '',
        email: '',
        password: '',
        confirmPassword: '',
        vehicleMaker: '',
        vehicleName: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);
    const [isAgreed, setIsAgreed] = useState(false);

    const handleNext = () => {
        const { lastName, firstName, displayName, email, password, confirmPassword } = formData;
        if (!lastName.trim() || !firstName.trim() || !displayName.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
            alert('すべてのユーザープロフィール項目を入力してください。');
            return;
        }

        // パスワードのバリデーション（8文字以上、半角英数字を含む）
        const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(password)) {
            alert('パスワードは8文字以上で、英字と数字をそれぞれ1文字以上含める必要があります。');
            return;
        }

        if (password !== confirmPassword) {
            alert('パスワードが一致しません。もう一度確認してください。');
            return;
        }
        setStep(2);
    };

    const handleBack = () => {
        if (step === 2) {
            setStep(1);
        }
    };

    const handleSubmit = async (e: React.FormEvent | React.MouseEvent) => {
        if (e) e.preventDefault();

        if (!formData.vehicleMaker.trim() || !formData.vehicleName.trim()) {
            alert('車両メーカーと車両名を入力してください。');
            return;
        }

        if (!isAgreed) {
            alert('利用規約およびプライバシーポリシーに同意してください。');
            return;
        }

        try {
            // 1. Safe Signup via Supabase Auth on the Frontend
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: formData.email.trim(),
                password: formData.password.trim(),
            });

            if (authError) {
                console.error('Supabase Setup Error:', authError.message);
                throw new Error(authError.message);
            }

            if (!authData.user?.id) {
                throw new Error('ユーザーIDの取得に失敗しました。');
            }

            // 2. Prepare payload without password
            const payload = {
                userId: authData.user.id,
                lastName: formData.lastName,
                firstName: formData.firstName,
                displayName: formData.displayName,
                email: formData.email,
                vehicleMaker: formData.vehicleMaker,
                vehicleName: formData.vehicleName
            };

            // 3. Send securely to backend for Profile and Vehicle DB creation
            const response = await apiFetch('/api/users/onboarding', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'プロフィールの保存に失敗しました');
            }

            console.log('Onboarding Success:', data);
            alert('登録が完了しました！ ホーム画面に移動します。');
            window.location.href = '/home'; // In a real app we might use react-router-dom useNavigate
        } catch (error: any) {
            console.error('Onboarding Error:', error);
            alert(error.message || 'エラーが発生しました。もう一度お試しください。');
        }
    };

    return (
        <div className="onboarding-page">
            <div className="onboarding-bg" />

            <div className="onboarding-content">
                <div className="onboarding-header">
                    <h1 className="onboarding-title">Welcome to <span className="onboarding-accent">ride</span></h1>
                    <p className="onboarding-subtitle">あなたのプロフィールと、最初の愛車を登録しましょう。</p>
                </div>

                <div className="onboarding-progress">
                    <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>1. Profile</div>
                    <div className="progress-line" />
                    <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>2. Vehicle</div>
                </div>

                <div className="onboarding-form-container">
                    <div>
                        {/* STEP 1: User Profile */}
                        {step === 1 && (
                            <div className="onboarding-step-wrapper fade-in">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label htmlFor="lastName">　姓</label>
                                        <input
                                            type="text"
                                            id="lastName"
                                            name="lastName"
                                            value={formData.lastName}
                                            onChange={handleChange}
                                            placeholder="山田"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="firstName">　名</label>
                                        <input
                                            type="text"
                                            id="firstName"
                                            name="firstName"
                                            value={formData.firstName}
                                            onChange={handleChange}
                                            placeholder="太郎"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="displayName">　表示名</label>
                                    <input
                                        type="text"
                                        id="displayName"
                                        name="displayName"
                                        value={formData.displayName}
                                        onChange={handleChange}
                                        placeholder="e.g. Takumi"
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="email">　メールアドレス</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="example@ride.com"
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="password">　パスワード</label>
                                    <div className="onboarding-password-wrapper">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            id="password"
                                            name="password"
                                            value={formData.password}
                                            onChange={handleChange}
                                            placeholder="••••••••"
                                            className="onboarding-password-input"
                                        />
                                        <button
                                            type="button"
                                            className="onboarding-password-toggle"
                                            onClick={() => setShowPassword(!showPassword)}
                                        >
                                            {showPassword ? (
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                            ) : (
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="confirmPassword">　パスワード（確認用）</label>
                                    <div className="onboarding-password-wrapper">
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            id="confirmPassword"
                                            name="confirmPassword"
                                            value={formData.confirmPassword}
                                            onChange={handleChange}
                                            placeholder="••••••••"
                                            className="onboarding-password-input"
                                        />
                                        <button
                                            type="button"
                                            className="onboarding-password-toggle"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        >
                                            {showConfirmPassword ? (
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                            ) : (
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div className="form-actions split">
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => window.location.href = '/'}
                                    >
                                        戻る
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={handleNext}
                                    >
                                        次へ
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: Vehicle Info */}
                        {step === 2 && (
                            <div className="onboarding-step-wrapper fade-in">
                                <div className="form-group">
                                    <label htmlFor="vehicleMaker">　車両メーカー</label>
                                    <div className="custom-select-wrapper">
                                        <select
                                            id="vehicleMaker"
                                            name="vehicleMaker"
                                            value={formData.vehicleMaker}
                                            onChange={handleChange as any} // React onChange type for select is slightly different but compatible here
                                            className="custom-select"
                                        >
                                            <option value="" disabled>メーカーを選択してください</option>
                                            {VEHICLE_MAKERS.map(maker => (
                                                <option key={maker.value} value={maker.value}>{maker.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="vehicleName">　愛車名</label>
                                    <input
                                        type="text"
                                        id="vehicleName"
                                        name="vehicleName"
                                        value={formData.vehicleName}
                                        onChange={handleChange}
                                        placeholder="e.g. CB400SF"
                                    />
                                </div>
                                <div className="onboarding-agreement">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={isAgreed}
                                            onChange={(e) => setIsAgreed(e.target.checked)}
                                        />
                                        <span>
                                            <button type="button" className="text-link" onClick={() => setShowTermsModal(true)}>利用規約</button>
                                            および
                                            <button type="button" className="text-link" onClick={() => setShowPrivacyModal(true)}>プライバシーポリシー</button>
                                            に同意する
                                        </span>
                                    </label>
                                </div>
                                <div className="form-actions split">
                                    <button type="button" className="btn-secondary" onClick={handleBack}>
                                        戻る
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={handleSubmit}
                                    >
                                        登録を完了する
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Modals */}
            {showTermsModal && (
                <div className="onboarding-modal-overlay">
                    <div className="onboarding-modal-content fade-in">
                        <div className="onboarding-modal-header">
                            <h2>利用規約</h2>
                            <button className="onboarding-modal-close" onClick={() => setShowTermsModal(false)}>×</button>
                        </div>
                        <div className="onboarding-modal-body markdown-body">
                            <ReactMarkdown>{termsText}</ReactMarkdown>
                        </div>
                    </div>
                </div>
            )}

            {showPrivacyModal && (
                <div className="onboarding-modal-overlay">
                    <div className="onboarding-modal-content fade-in">
                        <div className="onboarding-modal-header">
                            <h2>プライバシーポリシー</h2>
                            <button className="onboarding-modal-close" onClick={() => setShowPrivacyModal(false)}>×</button>
                        </div>
                        <div className="onboarding-modal-body markdown-body">
                            <ReactMarkdown>{privacyText}</ReactMarkdown>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default OnboardingPage;
