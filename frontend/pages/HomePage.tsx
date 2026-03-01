import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';
import BottomNav from '../components/BottomNav';
import './HomePage.css';

function HomePage() {
    const navigate = useNavigate();
    const { profileData } = useAuth();

    // Background Image State
    const [bgImage] = useState<string | null>(() => localStorage.getItem('home_bg_image'));

    // 最初の車両データを取得（複数車両対応は将来の拡張）
    const vehicle = profileData?.vehicles?.[0] ?? null;

    // 走行距離のフォーマット（例: 34200 → "34,200 km"）
    const formatMileage = (mileage: number | null | undefined): string => {
        if (mileage == null) return '--- km';
        return `${mileage.toLocaleString()} km`;
    };

    const vehicleName = vehicle
        ? `${vehicle.maker} ${vehicle.model_name}`
        : '車両未登録';
    const currentOdo = formatMileage(vehicle?.current_mileage);

    // ルート推薦（Explore機能実装時にリアルデータ化予定）
    const recommendedRoute = {
        title: "阿蘇パノラマライン",
        duration: "1h 30m",
        description: "夕陽が当たる最高のワインディングロード"
    };

    return (
        <div className="home-page">
            {/* Background */}
            <div
                className="home-bg"
                style={bgImage ? {
                    backgroundImage: `linear-gradient(to bottom, rgba(13, 17, 23, 0.1) 0%, rgba(13, 17, 23, 0.9) 60%, rgba(13, 17, 23, 1) 100%), url(${bgImage})`
                } : undefined}
            />

            <div className="home-content">
                {/* Logo Area */}
                <div className="home-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', marginTop: '-1rem' }}>
                    <h1 className="home-text-logo">
                        <span className="home-text-logo-accent">r</span>ide
                    </h1>
                </div>

                {/* 1. Header (Status) */}
                <header className="home-header">
                    <div className="status-block">
                        <h2 className="vehicle-name">{vehicleName}</h2>
                        <span className="vehicle-odo">ODO: {currentOdo}</span>
                    </div>
                </header>

                {/* 2. Recommend Route Card */}
                <section className="home-recommend">
                    <h3 className="section-title">おすすめルート</h3>
                    <div className="route-card" onClick={() => navigate('/explore')}>
                        <div className="route-card-bg"></div>
                        <div className="route-card-content">
                            <span className="route-duration">⏱ {recommendedRoute.duration}</span>
                            <h4 className="route-title">{recommendedRoute.title}</h4>
                            <p className="route-desc">{recommendedRoute.description}</p>
                        </div>
                    </div>
                </section>
            </div>

            {/* 4. Bottom Navigation */}
            <BottomNav />
        </div>
    );
}

export default HomePage;
