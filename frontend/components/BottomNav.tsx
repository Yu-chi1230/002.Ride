import { useNavigate, useLocation } from 'react-router-dom';
import './BottomNav.css';

function BottomNav() {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <nav className="bottom-nav">
            <button
                className={`bottom-nav-item ${location.pathname === '/home' ? 'active' : ''}`}
                onClick={() => navigate('/home')}
            >
                <span className="bottom-nav-label">Home</span>
            </button>

            {/* 中央の丸型ヘルスメータ (FAB風) */}
            <div className="bottom-nav-fab-container">
                <button
                    className="bottom-nav-fab"
                    onClick={() => navigate('/health')}
                >
                    <div className="fab-inner">
                        <span className="fab-icon">🩺</span>
                    </div>
                </button>
            </div>

            <button
                className={`bottom-nav-item ${location.pathname === '/settings' ? 'active' : ''}`}
                onClick={() => navigate('/settings')}
            >
                <span className="bottom-nav-label">Setting</span>
            </button>
        </nav>
    );
}

export default BottomNav;
