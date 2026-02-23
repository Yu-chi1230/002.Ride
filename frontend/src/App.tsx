import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '../styles/global.css';
import LoginPage from '../pages/LoginPage';
import HomePage from '../pages/HomePage';
import HealthPage from '../pages/HealthPage';
import OnboardingPage from '../pages/OnboardingPage';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AuthRoute from './components/AuthRoute';

function App() {
    return (
        <AuthProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Routes>
                    {/* Public routes for unauthenticated users only */}
                    <Route element={<AuthRoute />}>
                        <Route path="/" element={<LoginPage />} />
                        <Route path="/onboarding" element={<OnboardingPage />} />
                    </Route>

                    {/* Protected routes for authenticated users only */}
                    <Route element={<ProtectedRoute />}>
                        <Route path="/home" element={<HomePage />} />
                    </Route>

                    {/* Common / Utility Routes */}
                    <Route path="/health" element={<HealthPage />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
