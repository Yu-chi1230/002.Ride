import { BrowserRouter, Routes, Route } from 'react-router-dom';
import '../styles/global.css';
import LoginPage from '../pages/LoginPage';
import HomePage from '../pages/HomePage';
import HealthPage from '../pages/HealthPage';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<LoginPage />} />
                <Route path="/home" element={<HomePage />} />
                <Route path="/health" element={<HealthPage />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
