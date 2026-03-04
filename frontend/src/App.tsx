import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '../styles/global.css';
import LoginPage from '../pages/LoginPage';
import HomePage from '../pages/HomePage';
import HealthPage from '../pages/HealthPage';
import ExplorePage from '../pages/ExplorePage';
import ExploreGuidePage from '../pages/ExploreGuidePage';
import OnboardingPage from '../pages/OnboardingPage';
import CreatePage from '../pages/CreatePage';
import SettingPage from '../pages/SettingPage';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AuthRoute from './components/AuthRoute';

// Custom hook to disable iOS Safari bounce/swipe navigation
const useDisableIOSSwipeBounce = () => {
    useEffect(() => {
        let startX = 0;
        let startY = 0;

        const handleTouchStart = (e: TouchEvent) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        };

        const preventDefault = (e: TouchEvent) => {
            const touch = e.touches[0];
            const currentX = touch.clientX;
            const currentY = touch.clientY;

            // 1. Block edge swipes (started within 20px of screen edges)
            if (startX < 20 || startX > window.innerWidth - 20) {
                e.preventDefault();
                return;
            }

            // 2. Block horizontal swipes
            const diffX = Math.abs(currentX - startX);
            const diffY = Math.abs(currentY - startY);
            // Ignore tiny movements to allow taps
            if (diffX > diffY && diffX > 5) {
                e.preventDefault();
                return;
            }

            // 3. Allow vertical scroll ONLY if the target is inside a scrollable area.
            const target = e.target as HTMLElement;
            const isScrollable = target.closest('#root') || target.closest('.overflow-y-auto') || target.closest('.scrollable');

            if (!isScrollable) {
                e.preventDefault();
            }
        };

        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchmove', preventDefault, { passive: false });

        return () => {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', preventDefault);
        };
    }, []);
};

function App() {
    useDisableIOSSwipeBounce();

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
                        <Route path="/explore" element={<ExplorePage />} />
                        <Route path="/explore/guide/:routeId" element={<ExploreGuidePage />} />
                        <Route path="/create" element={<CreatePage />} />
                        <Route path="/settings" element={<SettingPage />} />
                    </Route>

                    {/* Common / Utility Routes */}
                    <Route path="/health" element={<HealthPage />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
