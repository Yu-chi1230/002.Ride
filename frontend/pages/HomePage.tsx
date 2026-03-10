import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';
import { apiFetch } from '../src/lib/api';
import { supabase } from '../src/lib/supabase';
import { Bell, X } from 'lucide-react';
import BottomNav from '../components/BottomNav';
import './HomePage.css';

function HomePage() {
    const navigate = useNavigate();
    const { session } = useAuth();

    // Drawer & Announcement States
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [announcements, setAnnouncements] = useState<any[]>([]);

    // Background Image State
    const [bgImage] = useState<string | null>(() => localStorage.getItem('home_bg_image'));
    const [bgPositionY] = useState<number>(() => {
        const saved = localStorage.getItem('home_bg_position_y');
        return saved ? Number(saved) : 0;
    });

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

    // Fetch Announcements
    useEffect(() => {
        let isMounted = true;

        const fetchAnnouncements = async () => {
            try {
                // RLS on the DB will automatically filter out expired or non-applicable announcements
                const { data, error } = await supabase
                    .from('announcements')
                    .select('*')
                    .order('start_date', { ascending: false });

                if (error) {
                    console.error("Error fetching announcements:", error);
                    return;
                }

                if (isMounted && data) {
                    setAnnouncements(data);
                }
            } catch (err) {
                console.error("Unexpected error fetching announcements:", err);
            }
        };

        // Fetch user specific announcements only when session is ready (or fetch globals if not logged in)
        fetchAnnouncements();

        return () => { isMounted = false; };
    }, [session]);

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
                    backgroundImage: `linear-gradient(to bottom, rgba(13, 17, 23, 0.0) 0%, rgba(13, 17, 23, 0.7) 80%, rgba(13, 17, 23, 1.0) 100%), url(${bgImage})`,
                    backgroundPosition: `center ${bgPositionY}%`
                } : undefined}
            />

            <div className="home-content">
                {/* Top Bar */}
                <header className="home-top-bar">
                    <div className="home-top-bar-left">
                        <Bell
                            strokeWidth={1.5}
                            className="notification-icon"
                            onClick={() => setIsDrawerOpen(true)}
                        />
                    </div>
                    <h1 className="home-text-logo">
                        <span className="home-text-logo-accent">r</span>ide
                    </h1>
                    <div className="home-top-bar-right">
                        {/* Empty or future icons */}
                    </div>
                </header>

                {/* 2. Recommend Route Card */}
                <section className="home-recommend">
                    <h3 className="section-title">おすすめルート</h3>
                    <div className="route-card" onClick={() => {
                        if (latestRoute) {
                            navigate('/explore', { state: { predefinedRoute: latestRoute } });
                        } else {
                            navigate('/explore');
                        }
                    }}>
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

            {/* --- Navigation Drawer --- */}
            {/* Overlay */}
            <div
                className={`drawer-overlay ${isDrawerOpen ? 'open' : ''}`}
                onClick={() => setIsDrawerOpen(false)}
            />

            {/* Drawer Panel */}
            <div className={`nav-drawer ${isDrawerOpen ? 'open' : ''}`}>
                <div className="drawer-header">
                    <h2>お知らせ</h2>
                    <button className="drawer-close-btn" onClick={() => setIsDrawerOpen(false)}>
                        <X size={24} />
                    </button>
                </div>

                <div className="drawer-content">
                    <div className="announcement-list">
                        {announcements.length > 0 ? (
                            announcements.map((item) => {
                                // Format the date to YYYY.MM.DD
                                const dateObj = new Date(item.start_date);
                                const dateStr = `${dateObj.getFullYear()}.${String(dateObj.getMonth() + 1).padStart(2, '0')}.${String(dateObj.getDate()).padStart(2, '0')}`;

                                return (
                                    <div className="announcement-item" key={item.id}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <span className="announcement-date" style={{ marginBottom: 0 }}>{dateStr}</span>
                                            {!item.is_global && (
                                                <span style={{ fontSize: '0.65rem', color: '#D4AF37', border: '1px solid #D4AF37', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>
                                                    あなたへ
                                                </span>
                                            )}
                                        </div>
                                        {item.title && <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.9rem', color: '#E6EDF3' }}>{item.title}</h4>}
                                        <p className="announcement-text">{item.content}</p>
                                    </div>
                                );
                            })
                        ) : (
                            <p style={{ color: '#8B949E', fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem' }}>
                                現在新しいお知らせはありません。
                            </p>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
}

export default HomePage;
