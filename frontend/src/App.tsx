import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '../styles/global.css';
import LoginPage from '../pages/LoginPage';
import HomePage from '../pages/HomePage';
import HealthPage from '../pages/HealthPage';
import OnboardingPage from '../pages/OnboardingPage';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LoginPage />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/home" element={<HomePage />} />
                <Route path="/health" element={<HealthPage />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
