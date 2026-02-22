import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute() {
    const { user, hasProfile, isLoading } = useAuth();
    const location = useLocation();

    // Show loading state until we know the user AND their profile status
    if (isLoading || (user && hasProfile === null)) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0d0d0d', color: '#fff' }}>
                <p>Loading...</p>
            </div>
        );
    }

    if (!user) {
        // Redirect them to the /login page, but save the current location they were
        // trying to go to when they were redirected. This allows us to send them
        // along to that page after they login, which is a nicer user experience
        // than dropping them off on the home page.
        return <Navigate to="/" state={{ from: location }} replace />;
    }

    // User is authenticated but hasn't completed onboarding -> force redirect to /onboarding
    if (user && hasProfile === false) {
        return <Navigate to="/onboarding" replace />;
    }

    return <Outlet />;
}
