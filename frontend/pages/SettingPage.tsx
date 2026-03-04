import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';
import { apiFetch } from '../src/lib/api';
import BottomNav from '../components/BottomNav';
import { VEHICLE_MAKERS } from '../src/constants/vehicleMakers';
import './SettingPage.css';

function SettingPage() {
    const navigate = useNavigate();
    const { profileData, refreshProfile } = useAuth();

    // Status states
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Form states
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        display_name: '',
        vehicle_maker: '',
        vehicle_model_name: ''
    });

    // Populate form data once profileData is loaded
    useEffect(() => {
        if (profileData) {
            const vehicle = profileData.vehicles?.[0]; // Assume single vehicle for now
            setFormData({
                first_name: profileData.first_name || '',
                last_name: profileData.last_name || '',
                display_name: profileData.display_name || '',
                vehicle_maker: vehicle?.maker || '',
                vehicle_model_name: vehicle?.model_name || ''
            });
        }
    }, [profileData, isEditing]); // Refill data when editing is toggled (cancel edit)

    // Background Image
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage(null);

        try {
            const response = await apiFetch('/api/users/me', {
                method: 'PUT',
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                setMessage({ text: 'プロフィールを更新しました。', type: 'success' });
                setIsEditing(false);
                await refreshProfile(); // Refresh AuthContext
            } else {
                const errorData = await response.json();
                setMessage({ text: errorData.error || 'プロフィールの更新に失敗しました。', type: 'error' });
            }
        } catch (error) {
            console.error('Profile update error:', error);
            setMessage({ text: '通信エラーが発生しました。', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1920;
                const MAX_HEIGHT = 1080;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

                try {
                    localStorage.setItem('home_bg_image', dataUrl);
                    setMessage({ text: '背景画像を更新しました。', type: 'success' });
                } catch (err) {
                    console.error('LocalStorage quota exceeded', err);
                    setMessage({ text: '画像サイズが大きすぎます。', type: 'error' });
                }
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSignOut = async () => {
        const { supabase } = await import('../src/lib/supabase');
        await supabase.auth.signOut();
        navigate('/');
    };

    const handleDeleteAccount = async () => {
        if (!window.confirm("本当に退会しますか？\nこの操作は取り消せません。すべてのデータが完全に削除されます。")) {
            return;
        }

        setIsLoading(true);
        setMessage(null);

        try {
            const response = await apiFetch('/api/users/me', {
                method: 'DELETE'
            });

            if (response.ok) {
                // Backend successfully deleted the user. We must sign out the frontend session.
                const { supabase } = await import('../src/lib/supabase');
                await supabase.auth.signOut();
                navigate('/');
            } else {
                const errorData = await response.json();
                setMessage({ text: errorData.error || '退会処理に失敗しました。', type: 'error' });
            }
        } catch (error) {
            console.error('Account deletion error:', error);
            setMessage({ text: '通信エラーが発生しました。', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="setting-page">
            <div className="setting-content">
                <header className="setting-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h1>Settings</h1>
                    {!isEditing && (
                        <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', marginTop: '0.2rem' }} onClick={() => setIsEditing(true)}>
                            編集
                        </button>
                    )}
                </header>

                {message && (
                    <div style={{
                        padding: '1rem',
                        marginBottom: '1rem',
                        borderRadius: '8px',
                        backgroundColor: message.type === 'success' ? 'rgba(35, 134, 54, 0.2)' : 'rgba(218, 54, 51, 0.2)',
                        color: message.type === 'success' ? '#3fb950' : '#ff7b72',
                        border: `1px solid ${message.type === 'success' ? 'rgba(35, 134, 54, 0.4)' : 'rgba(218, 54, 51, 0.4)'}`
                    }}>
                        {message.text}
                    </div>
                )}

                {/* Profile Section */}
                <section className="setting-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 className="setting-section-title" style={{ borderBottom: 'none', marginBottom: 0 }}>プロフィール設定</h2>
                    </div>

                    <p className="setting-help-text" style={{ marginTop: '0.5rem' }}>名前や車両情報の確認・変更ができます。</p>

                    <form className="setting-form" onSubmit={handleSaveProfile}>
                        <div className="form-group">
                            <label>　表示名</label>
                            <input
                                type="text"
                                name="display_name"
                                value={formData.display_name}
                                onChange={handleInputChange}
                                disabled={!isEditing}
                                required
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label>　姓</label>
                                <input
                                    type="text"
                                    name="last_name"
                                    value={formData.last_name}
                                    onChange={handleInputChange}
                                    disabled={!isEditing}
                                    required
                                />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label>　名</label>
                                <input
                                    type="text"
                                    name="first_name"
                                    value={formData.first_name}
                                    onChange={handleInputChange}
                                    disabled={!isEditing}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-group" style={{ marginTop: '0.5rem' }}>
                            <label>　メーカー</label>
                            <select
                                name="vehicle_maker"
                                value={formData.vehicle_maker}
                                onChange={handleInputChange}
                                disabled={!isEditing}
                                required
                            >
                                <option value="" disabled>メーカーを選択してください</option>
                                {VEHICLE_MAKERS.map(maker => (
                                    <option key={maker.value} value={maker.value}>{maker.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>　車種名</label>
                            <input
                                type="text"
                                name="vehicle_model_name"
                                value={formData.vehicle_model_name}
                                onChange={handleInputChange}
                                disabled={!isEditing}
                                required
                            />
                        </div>

                        {isEditing && (
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{ flex: 1 }}
                                    onClick={() => { setIsEditing(false); setMessage(null); }}
                                    disabled={isLoading}
                                >
                                    キャンセル
                                </button>
                                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isLoading}>
                                    {isLoading ? '保存中...' : '保存する'}
                                </button>
                            </div>
                        )}
                    </form>
                </section>

                {/* Preferences Section */}
                <section className="setting-section">
                    <h2 className="setting-section-title">アプリ設定</h2>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <p className="setting-help-text" style={{ marginBottom: '0.5rem' }}>Explore画面でのデフォルトの走行時間</p>
                        <select
                            defaultValue={localStorage.getItem('default_riding_time') || '60'}
                            onChange={(e) => {
                                localStorage.setItem('default_riding_time', e.target.value);
                                setMessage({ text: 'デフォルトの走行時間を更新しました。', type: 'success' });
                            }}
                            style={{
                                width: '100%',
                                background: '#0d1117',
                                color: '#c9d1d9',
                                border: '1px solid #30363d',
                                padding: '0.8rem 1rem',
                                borderRadius: '8px',
                                appearance: 'none',
                                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 1rem center',
                                backgroundSize: '1em'
                            }}
                        >
                            <option value="30">30分</option>
                            <option value="60">1時間 (60分)</option>
                            <option value="90">1時間30分 (90分)</option>
                            <option value="120">2時間 (120分)</option>
                            <option value="180">3時間 (180分)</option>
                            <option value="240">4時間 (240分)</option>
                            <option value="300">5時間 (300分)</option>
                        </select>
                    </div>

                    <p className="setting-help-text">ホーム画面の背景画像を変更できます。</p>
                    <button
                        className="btn-secondary"
                        style={{ width: '100%' }}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        背景画像を変更する
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleBgUpload}
                        accept="image/*"
                        style={{ display: 'none' }}
                    />
                </section>

                {/* Account Section */}
                <section className="setting-section" style={{ border: '1px solid rgba(218, 54, 51, 0.3)' }}>
                    <h2 className="setting-section-title" style={{ color: '#ff7b72', borderBottomColor: 'rgba(218, 54, 51, 0.2)' }}>アカウント</h2>
                    <p className="setting-help-text">現在のアカウントからサインアウトします。</p>
                    <button className="btn-secondary" style={{ width: '100%', marginBottom: '1rem' }} onClick={handleSignOut}>
                        サインアウト
                    </button>

                    <h3 style={{ color: '#ff7b72', fontSize: '1rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>退会（アカウント削除）</h3>
                    <p className="setting-help-text" style={{ color: 'rgba(255, 123, 114, 0.8)' }}>
                        アカウントを削除すると、すべてのルート・車両情報・画像データが完全に失われます。この操作は取り消せません。
                    </p>
                    <button className="btn-danger" onClick={handleDeleteAccount} disabled={isLoading}>
                        {isLoading ? '処理中...' : '退会する'}
                    </button>
                </section>
            </div>

            <BottomNav />
        </div>
    );
}

export default SettingPage;
