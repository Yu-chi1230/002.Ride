import { useState } from 'react';
import { supabase } from '../src/lib/supabase';
import { apiFetch } from '../src/lib/api';
import './OnboardingPage.css';

function OnboardingPage() {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        lastName: '',
        firstName: '',
        displayName: '',
        email: '',
        password: '',
        vehicleMaker: '',
        vehicleName: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleNext = () => {
        const { lastName, firstName, displayName, email, password } = formData;
        if (!lastName.trim() || !firstName.trim() || !displayName.trim() || !email.trim() || !password.trim()) {
            alert('すべてのユーザープロフィール項目を入力してください。');
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
                                <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label htmlFor="lastName">姓 (Last Name)</label>
                                        <input
                                            type="text"
                                            id="lastName"
                                            name="lastName"
                                            value={formData.lastName}
                                            onChange={handleChange}
                                            placeholder="山田"
                                        />
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label htmlFor="firstName">名 (First Name)</label>
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
                                    <label htmlFor="displayName">表示名 (Display Name)</label>
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
                                    <label htmlFor="email">メールアドレス (Email)</label>
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
                                    <label htmlFor="password">パスワード (Password)</label>
                                    <input
                                        type="password"
                                        id="password"
                                        name="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        placeholder="••••••••"
                                    />
                                </div>
                                <div className="form-actions right">
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
                                    <label htmlFor="vehicleMaker">車両メーカー (Vehicle Maker)</label>
                                    <div className="custom-select-wrapper">
                                        <select
                                            id="vehicleMaker"
                                            name="vehicleMaker"
                                            value={formData.vehicleMaker}
                                            onChange={handleChange as any} // React onChange type for select is slightly different but compatible here
                                            className="custom-select"
                                        >
                                            <option value="" disabled>メーカーを選択してください</option>
                                            <option value="Honda">ホンダ</option>
                                            <option value="Yamaha">ヤマハ</option>
                                            <option value="Suzuki">スズキ</option>
                                            <option value="Kawasaki">カワサキ</option>
                                            <option value="HarleyDavidson">ハーレーダビッドソン</option>
                                            <option value="Triumph">トライアンフ</option>
                                            <option value="Ducati">ドゥカティ</option>
                                            <option value="Other">その他 (Other)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label htmlFor="vehicleName">Vehicle Name / Model</label>
                                    <input
                                        type="text"
                                        id="vehicleName"
                                        name="vehicleName"
                                        value={formData.vehicleName}
                                        onChange={handleChange}
                                        placeholder="e.g. CB400SF, Civic Type R"
                                    />
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
        </div>
    );
}

export default OnboardingPage;
