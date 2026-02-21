import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthRoute() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0d0d0d', color: '#fff' }}>
                <p>Loading...</p>
            </div>
        );
    }

    if (user) {
        // Redirect authenticated users to the home page
        return <Navigate to="/home" replace />;
    }

    return <Outlet />;
}
