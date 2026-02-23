import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';
import BottomNav from '../components/BottomNav';
import './HomePage.css';

function HomePage() {
    const navigate = useNavigate();
    const { profileData } = useAuth();

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
        duration: "1h",
        description: "夕陽が当たる最高のワインディングロード"
    };

    return (
        <div className="home-page">
            {/* Background */}
            <div className="home-bg" />

            <div className="home-content">
                {/* 1. Header (Status) */}
                <header className="home-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div className="status-block">
                            <h2 className="vehicle-name">{vehicleName}</h2>
                            <span className="vehicle-odo">ODO: {currentOdo}</span>
                        </div>
                        <div className="health-block">
                            <span className="health-label">HEALTH</span>
                            <span className="health-score">--</span>
                        </div>
                    </div>
                    <button
                        onClick={async () => {
                            const { supabase } = await import('../src/lib/supabase');
                            await supabase.auth.signOut();
                        }}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            color: 'rgba(255, 255, 255, 0.7)',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                        }}
                    >
                        Sign Out
                    </button>
                </header>

                {/* 2. Main Features (3 Cards) */}
                <main className="home-features">
                    <button className="feature-card health" onClick={() => navigate('/health')}>
                        <div className="feature-icon">🩺</div>
                        <div className="feature-text">
                            <h3>Health</h3>
                            <p>コンディション診断</p>
                        </div>
                    </button>
                    <button className="feature-card explore" onClick={() => navigate('/explore')}>
                        <div className="feature-icon">🗺️</div>
                        <div className="feature-text">
                            <h3>Explore</h3>
                            <p>ルートレコメンド</p>
                        </div>
                    </button>
                    <button className="feature-card create" onClick={() => navigate('/create')}>
                        <div className="feature-icon">🎬</div>
                        <div className="feature-text">
                            <h3>Create</h3>
                            <p>シネマエディター</p>
                        </div>
                    </button>
                </main>

                {/* 3. Recommend Route Card */}
                <section className="home-recommend">
                    <h3 className="section-title">SUGGESTED ROUTE</h3>
                    <div className="route-card">
                        <div className="route-card-bg"></div>
                        <div className="route-card-content">
                            <span className="route-duration">{recommendedRoute.duration}</span>
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

