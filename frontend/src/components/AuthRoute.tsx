import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthRoute() {
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

    if (user) {
        if (hasProfile) {
            // Redirect authenticated and onboarded users to the home page
            return <Navigate to="/home" replace />;
        } else {
            // Authenticated but no profile.
            // Allow access ONLY to /onboarding. If they are on /, redirect to /onboarding.
            if (location.pathname !== '/onboarding') {
                return <Navigate to="/onboarding" replace />;
            }
        }
    }

    return <Outlet />;
}
