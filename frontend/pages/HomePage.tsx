import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';
import { apiFetch } from '../src/lib/api';
import BottomNav from '../components/BottomNav';
import './HomePage.css';

function HomePage() {
    const navigate = useNavigate();
    const { profileData, session } = useAuth();

    // Background Image State
    const [bgImage] = useState<string | null>(() => localStorage.getItem('home_bg_image'));

    // Latest Route State
    const [latestRoute, setLatestRoute] = useState<any>(null);

    useEffect(() => {
        let isMounted = true;

        const fetchLatestRoute = async () => {
            if (!session) {
                return;
            }
            try {
                const res = await apiFetch('/api/explore/routes/latest', {}, session.access_token);
                if (res.ok) {
                    const json = await res.json();
                    if (isMounted) setLatestRoute(json.data.route);
                }
            } catch (err) {
                console.error("Error fetching latest route:", err);
            }
        };

        fetchLatestRoute();
        return () => { isMounted = false; };
    }, [session]);

    // 最初の車両データを取得（複数車両対応は将来の拡張）
    const vehicle = profileData?.vehicles?.[0] ?? null;

    const vehicleName = vehicle
        ? vehicle.model_name
        : '車両未登録';

    const formatDuration = (mins: number) => {
        if (!mins) return '';
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    };

    // ルート推薦（Explore機能実装時にリアルデータ化予定）
    const recommendedRoute = latestRoute ? {
        title: latestRoute.title || "生成されたルート",
        duration: formatDuration(latestRoute.time_limit_minutes),
        description: `${latestRoute.total_distance_km ? latestRoute.total_distance_km.toFixed(1) + 'kmの' : ''}AI推奨ルート`
    } : {
        title: "新しいルートを生成",
        duration: "---",
        description: "ExploreでAIにルートを作成してもらいましょう"
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
                <div className="home-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.0rem', marginTop: '0.75rem', marginLeft: '0.5rem' }}>
                    <h1 className="home-text-logo">
                        <span className="home-text-logo-accent">r</span>ide
                    </h1>
                </div>

                {/* 1. Header (Status) */}
                <header className="home-header">
                    <div className="status-block">
                        <h2 className="vehicle-name">{vehicleName}</h2>
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
