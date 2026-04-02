import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../src/lib/cropImage';
import { useAuth } from '../src/contexts/AuthContext';
import { apiFetch } from '../src/lib/api';
import BottomNav from '../components/BottomNav';
import { VEHICLE_MAKERS } from '../src/constants/vehicleMakers';
import './SettingPage.css';

const formatDateForInput = (value: string | Date | null | undefined): string => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
};

function SettingPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { profileData, refreshProfile } = useAuth();
    const oilMaintenanceStatus = profileData?.vehicles?.[0]?.oil_maintenance_status ?? null;
    const contentRef = useRef<HTMLDivElement>(null);

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

    const [oilFormData, setOilFormData] = useState({
        last_oil_change_date: '',
        last_oil_change_mileage: '',
        monthly_avg_mileage: '',
        oil_change_interval_km: ''
    });

    // Cropper states
    const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const [isCropping, setIsCropping] = useState(false);

    // Populate profile form data once profileData is loaded
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

    // Populate oil settings (always editable, independent from profile edit mode)
    useEffect(() => {
        if (profileData) {
            const vehicle = profileData.vehicles?.[0]; // Assume single vehicle for now
            setOilFormData({
                last_oil_change_date: formatDateForInput(vehicle?.last_oil_change_date),
                last_oil_change_mileage: vehicle?.last_oil_change_mileage?.toString() || '',
                monthly_avg_mileage: vehicle?.monthly_avg_mileage?.toString() || '',
                oil_change_interval_km: vehicle?.oil_maintenance_status?.interval_km?.toString() || ''
            });
        }
    }, [profileData]);

    useEffect(() => {
        const shouldScrollToTop =
            typeof location.state === 'object' &&
            location.state !== null &&
            'scrollToTop' in location.state &&
            location.state.scrollToTop === true;

        if (!shouldScrollToTop) {
            return;
        }

        const rootElement = document.getElementById('root');

        if (rootElement) {
            rootElement.scrollTop = 0;
        }

        if (contentRef.current) {
            contentRef.current.scrollTop = 0;
        }
    }, [location.state]);

    // Background Image
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleOilInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setOilFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage(null);

        try {
            const requestBody = {
                first_name: formData.first_name,
                last_name: formData.last_name,
                display_name: formData.display_name,
                vehicle_maker: formData.vehicle_maker,
                vehicle_model_name: formData.vehicle_model_name
            };

            const response = await apiFetch('/api/users/me', {
                method: 'PUT',
                body: JSON.stringify(requestBody)
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

    const handleSaveOilSettings = async () => {
        setIsLoading(true);
        setMessage(null);

        try {
            const parsedOilMileage = oilFormData.last_oil_change_mileage === '' ? null : Number(oilFormData.last_oil_change_mileage);
            const parsedMonthlyAvgMileage = oilFormData.monthly_avg_mileage === '' ? null : Number(oilFormData.monthly_avg_mileage);
            const parsedOilChangeIntervalKm = oilFormData.oil_change_interval_km === '' ? null : Number(oilFormData.oil_change_interval_km);

            if (parsedOilMileage !== null && (!Number.isFinite(parsedOilMileage) || parsedOilMileage < 0)) {
                setMessage({ text: '前回オイル交換時の走行距離は0以上の数値で入力してください。', type: 'error' });
                setIsLoading(false);
                return;
            }

            if (parsedMonthlyAvgMileage !== null && (!Number.isFinite(parsedMonthlyAvgMileage) || parsedMonthlyAvgMileage < 0)) {
                setMessage({ text: '一ヶ月あたりの平均走行距離は0以上の数値で入力してください。', type: 'error' });
                setIsLoading(false);
                return;
            }

            if (parsedOilChangeIntervalKm !== null && (!Number.isFinite(parsedOilChangeIntervalKm) || parsedOilChangeIntervalKm < 0)) {
                setMessage({ text: 'オイル交換サイクルは0以上の数値で入力してください。', type: 'error' });
                setIsLoading(false);
                return;
            }

            const response = await apiFetch('/api/users/me', {
                method: 'PUT',
                body: JSON.stringify({
                    last_oil_change_date: oilFormData.last_oil_change_date || null,
                    last_oil_change_mileage: parsedOilMileage,
                    monthly_avg_mileage: parsedMonthlyAvgMileage,
                    oil_change_interval_km: parsedOilChangeIntervalKm
                })
            });

            if (response.ok) {
                setMessage({ text: 'オイル管理情報を更新しました。', type: 'success' });
                await refreshProfile();
            } else {
                const errorData = await response.json();
                setMessage({ text: errorData.error || 'オイル管理情報の更新に失敗しました。', type: 'error' });
            }
        } catch (error) {
            console.error('Oil settings update error:', error);
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
            setCropImageSrc(event.target?.result as string);
            setIsCropping(true);
        };
        reader.readAsDataURL(file);

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const onCropComplete = (_croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    };

    const handleCropSave = async () => {
        if (!cropImageSrc || !croppedAreaPixels) return;

        try {
            setIsLoading(true);
            const croppedImageBlobUrl = await getCroppedImg(cropImageSrc, croppedAreaPixels);

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

                setIsCropping(false);
                setCropImageSrc(null);
                setIsLoading(false);
            };
            img.src = croppedImageBlobUrl;
        } catch (e) {
            console.error(e);
            setMessage({ text: '画像の切り抜きに失敗しました。', type: 'error' });
            setIsCropping(false);
            setCropImageSrc(null);
            setIsLoading(false);
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
            <div ref={contentRef} className="setting-content">
                <header className="setting-header">
                    <h1>Settings</h1>
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

                        {isEditing ? (
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
                        ) : (
                            <button
                                type="button"
                                className="btn-primary"
                                style={{ width: '100%', marginTop: '0.5rem' }}
                                onClick={() => setIsEditing(true)}
                            >
                                編集
                            </button>
                        )}
                    </form>
                </section>

                {/* Oil Management Section */}
                <section className="setting-section">
                    <h2 className="setting-section-title">オイル管理</h2>

                    <div className="setting-form">
                        <div className="form-group">
                            <label>　前回のオイル交換時年月日</label>
                            <input
                                type="date"
                                name="last_oil_change_date"
                                value={oilFormData.last_oil_change_date}
                                onChange={handleOilInputChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>　前回のオイル交換時の走行距離 (km)</label>
                            <input
                                type="number"
                                name="last_oil_change_mileage"
                                value={oilFormData.last_oil_change_mileage}
                                onChange={handleOilInputChange}
                                min="0"
                                step="1"
                                inputMode="numeric"
                            />
                        </div>

                        <div className="form-group">
                            <label>　一ヶ月あたりの平均走行距離 (km)</label>
                            <input
                                type="number"
                                name="monthly_avg_mileage"
                                value={oilFormData.monthly_avg_mileage}
                                onChange={handleOilInputChange}
                                min="0"
                                step="1"
                                inputMode="numeric"
                            />
                        </div>

                        <div className="form-group">
                            <label>　オイル交換サイクル (km)</label>
                            <input
                                type="number"
                                name="oil_change_interval_km"
                                value={oilFormData.oil_change_interval_km}
                                onChange={handleOilInputChange}
                                min="0"
                                step="1"
                                inputMode="numeric"
                            />
                        </div>

                        <p className="setting-help-text" style={{ marginTop: '0.25rem', marginBottom: '1rem' }}>
                            {oilMaintenanceStatus
                                ? oilMaintenanceStatus.remaining_km === null
                                    ? '交換推奨までの残距離を計算するには、現在走行距離と前回交換時走行距離の両方が必要です。'
                                    : oilMaintenanceStatus.is_overdue
                                        ? `交換推奨距離を${Math.abs(oilMaintenanceStatus.remaining_km).toLocaleString()}km超過しています。`
                                        : `交換推奨まであと${oilMaintenanceStatus.remaining_km.toLocaleString()}kmです。`
                                : '交換推奨までの残距離を表示するには、オイル交換サイクルを設定してください。'}
                        </p>

                        <button
                            type="button"
                            className="btn-primary"
                            style={{ width: '100%', marginTop: '0.5rem' }}
                            onClick={handleSaveOilSettings}
                            disabled={isLoading}
                        >
                            {isLoading ? '保存中...' : 'オイル管理を保存'}
                        </button>
                    </div>
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

                <section className="setting-section">
                    <h2 className="setting-section-title">お問い合わせ</h2>
                    <p className="setting-help-text">
                        質問、不具合報告、改善要望を送信できます。
                    </p>
                    <button
                        className="btn-secondary"
                        style={{ width: '100%' }}
                        onClick={() => navigate('/settings/contact')}
                    >
                        問い合わせフォームを開く
                    </button>
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

            {/* Cropper Modal */}
            {isCropping && cropImageSrc && (
                <div className="cropper-modal">
                    <div className="cropper-header">
                        <button className="cropper-cancel-btn" onClick={() => { setIsCropping(false); setCropImageSrc(null); }}>キャンセル</button>
                        <h2 className="cropper-title">背景画像の位置調整</h2>
                        <button className="cropper-save-btn" onClick={handleCropSave} disabled={isLoading}>完了</button>
                    </div>
                    <div className="cropper-body">
                        <div className="cropper-container">
                            <Cropper
                                image={cropImageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={9 / 16}
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                            />
                        </div>
                        <div className="cropper-controls">
                            <input
                                type="range"
                                value={zoom}
                                min={1}
                                max={3}
                                step={0.1}
                                aria-labelledby="Zoom"
                                onChange={(e) => setZoom(Number(e.target.value))}
                                className="zoom-range"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default SettingPage;
