import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import './HealthPage.css';

function HealthPage() {
    const navigate = useNavigate();
    const [isRecording, setIsRecording] = useState(false);
    const [currentMode, setCurrentMode] = useState<'audio' | 'camera'>('audio');

    // 仮の波形UI用配列
    const waveforms = Array.from({ length: 40 });

    const handleRecordToggle = () => {
        setIsRecording(!isRecording);
        // FIXME: 実際はここでデバイスのマイクAPIを呼び出す
    };

    return (
        <div className="health-page">
            {/* Header */}
            <header className="health-header">
                <button className="back-btn" onClick={() => navigate('/home')}>← Back</button>
                <h2 className="health-title">Health Check</h2>
                <div className="spacer"></div>
            </header>

            <div className="health-content">

                {/* Mode Selector */}
                <div className="mode-selector">
                    <button
                        className={`mode-btn ${currentMode === 'audio' ? 'active' : ''}`}
                        onClick={() => setCurrentMode('audio')}
                    >
                        🎙️ Engine Sound
                    </button>
                    <button
                        className={`mode-btn ${currentMode === 'camera' ? 'active' : ''}`}
                        onClick={() => setCurrentMode('camera')}
                    >
                        📸 Visual Check
                    </button>
                </div>

                {/* Top Half: Audio Waveform UI */}
                <section className={`audio-section ${currentMode === 'audio' ? 'active-section' : 'inactive-section'}`}>
                    <div className="audio-instruction">
                        <h3>Listen to the Heartbeat</h3>
                        <p>エンジンを始動し、5秒間録音してください</p>
                    </div>

                    <div className={`waveform-container ${isRecording ? 'recording' : ''}`}>
                        {waveforms.map((_, i) => (
                            <div
                                key={i}
                                className="waveform-bar"
                                style={{
                                    height: isRecording ? `${Math.random() * 80 + 20}%` : '4px',
                                    animationDelay: `${i * 0.05}s`
                                }}
                            />
                        ))}
                    </div>

                    <button
                        className={`record-btn ${isRecording ? 'recording' : ''}`}
                        onClick={handleRecordToggle}
                    >
                        <div className="record-inner"></div>
                    </button>

                    {isRecording && <p className="recording-status">Recording... (3s)</p>}
                </section>

                {/* Bottom Half: Camera View UI (Mock) */}
                <section className={`camera-section ${currentMode === 'camera' ? 'active-section' : 'inactive-section'}`}>
                    <div className="camera-instruction">
                        <h3>Visual Inspection</h3>
                        <p>タイヤの溝やチェーンなどを撮影してください</p>
                    </div>

                    <div className="camera-viewfinder">
                        <div className="corner-tl"></div>
                        <div className="corner-tr"></div>
                        <div className="corner-bl"></div>
                        <div className="corner-br"></div>

                        {/* モックとしてのカメラスクリーン背景 */}
                        <div className="mock-camera-feed">
                            <span className="camera-icon">📷</span>
                            <span>Camera Feed</span>
                        </div>
                    </div>

                    <div className="camera-controls">
                        <button className="shutter-btn"></button>
                    </div>
                </section>

            </div>

            <BottomNav />
        </div>
    );
}

export default HealthPage;
