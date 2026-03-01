import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Activity, Map, PlusSquare, Settings } from 'lucide-react';
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
                <Home strokeWidth={1.5} className="bottom-nav-icon" />
                <span className="bottom-nav-label">Home</span>
            </button>
            <button
                className={`bottom-nav-item ${location.pathname === '/health' ? 'active' : ''}`}
                onClick={() => navigate('/health')}
            >
                <Activity strokeWidth={1.5} className="bottom-nav-icon" />
                <span className="bottom-nav-label">Health</span>
            </button>
            <button
                className={`bottom-nav-item ${location.pathname === '/explore' ? 'active' : ''}`}
                onClick={() => navigate('/explore')}
            >
                <Map strokeWidth={1.5} className="bottom-nav-icon" />
                <span className="bottom-nav-label">Explore</span>
            </button>
            <button
                className={`bottom-nav-item ${location.pathname === '/create' ? 'active' : ''}`}
                onClick={() => navigate('/create')}
            >
                <PlusSquare strokeWidth={1.5} className="bottom-nav-icon" />
                <span className="bottom-nav-label">Create</span>
            </button>
            <button
                className={`bottom-nav-item ${location.pathname === '/settings' ? 'active' : ''}`}
                onClick={() => navigate('/settings')}
            >
                <Settings strokeWidth={1.5} className="bottom-nav-icon" />
                <span className="bottom-nav-label">Settings</span>
            </button>
        </nav>
    );
}

export default BottomNav;
