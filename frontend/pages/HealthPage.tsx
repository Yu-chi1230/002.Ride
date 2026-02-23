import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { apiFetch } from '../src/lib/api';
import './HealthPage.css';

function HealthPage() {
    const navigate = useNavigate();
    const [isRecording, setIsRecording] = useState(false);
    const [currentMode, setCurrentMode] = useState<'audio' | 'camera'>('audio');

    // Visual Inspection States
    const [logType, setLogType] = useState<'meter' | 'tire' | 'chain' | 'plug' | 'engine'>('meter');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any | null>(null);

    // 仮の波形UI用配列
    const waveforms = Array.from({ length: 40 });

    const handleRecordToggle = () => {
        setIsRecording(!isRecording);
        // FIXME: 実際はここでデバイスのマイクAPIを呼び出す
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            setAnalysisResult(null); // Reset previous results
        }
    };

    const handleAnalyze = async () => {
        if (!imageFile) return;

        setIsAnalyzing(true);
        setAnalysisResult(null);

        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('log_type', logType);

        try {
            // FormData を送るために明示的にヘッダー指定（Content-Typeはブラウザに任せるため不要だがapiFetch内部で回避済み）
            const response = await apiFetch('/api/health/analyze', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                setAnalysisResult(data.data.analysis);
            } else {
                alert('Analysis failed');
            }
        } catch (error) {
            console.error('Analysis error:', error);
            alert('Analysis error occurred');
        } finally {
            setIsAnalyzing(false);
        }
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

                {/* Bottom Half: Camera View UI (Actually forms for Visual Inspection) */}
                <section className={`camera-section ${currentMode === 'camera' ? 'active-section' : 'inactive-section'}`}>
                    <div className="camera-instruction">
                        <h3>Visual Inspection</h3>
                        <p>対象パーツを選択し、写真をアップロードしてください</p>
                    </div>

                    <div className="inspection-form">
                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label style={{ color: '#aaa', fontSize: '0.9rem', display: 'block', marginBottom: '0.5rem' }}>Select Target Component</label>
                            <select
                                value={logType}
                                onChange={(e) => setLogType(e.target.value as any)}
                                style={{
                                    width: '100%',
                                    padding: '0.8rem',
                                    backgroundColor: '#222',
                                    color: '#fff',
                                    border: '1px solid #444',
                                    borderRadius: '8px',
                                    fontSize: '1rem'
                                }}
                            >
                                <option value="meter">メーター (ODO / Mileage)</option>
                                <option value="tire">タイヤ</option>
                                <option value="chain">ドライブチェーン</option>
                                <option value="plug">スパークプラグ</option>
                                <option value="engine">エンジンブロック</option>
                            </select>
                        </div>

                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                id="health-image-upload"
                                onChange={handleImageChange}
                                style={{ display: 'none' }}
                            />
                            <label htmlFor="health-image-upload" className="upload-btn" style={{
                                display: 'block',
                                textAlign: 'center',
                                padding: '1rem',
                                backgroundColor: previewUrl ? '#333' : '#1e1e1e',
                                border: '2px dashed #666',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.3s'
                            }}>
                                {previewUrl ? (
                                    <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px' }} />
                                ) : (
                                    <span>📸 Tap to open camera or gallery</span>
                                )}
                            </label>
                        </div>

                        {previewUrl && (
                            <button
                                className="analyze-btn"
                                onClick={handleAnalyze}
                                disabled={isAnalyzing}
                                style={{
                                    width: '100%',
                                    padding: '1rem',
                                    backgroundColor: isAnalyzing ? '#555' : '#00ffd5',
                                    color: isAnalyzing ? '#aaa' : '#000',
                                    border: 'none',
                                    borderRadius: '50px',
                                    fontWeight: 'bold',
                                    fontSize: '1.1rem',
                                    cursor: isAnalyzing ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {isAnalyzing ? 'Analyzing...' : '🔍 Run AI Analysis'}
                            </button>
                        )}
                    </div>

                    {/* Result Display Area */}
                    {analysisResult && (
                        <div className="analysis-result fade-in" style={{
                            marginTop: '2rem',
                            padding: '1.5rem',
                            backgroundColor: '#111',
                            border: `1px solid ${analysisResult.score && analysisResult.score < 60 ? '#ff4444' : '#00ffd5'}`,
                            borderRadius: '12px'
                        }}>
                            <h4 style={{ color: '#00ffd5', marginBottom: '1rem', fontSize: '1.2rem' }}>Analysis Complete</h4>

                            {analysisResult.mileage !== undefined && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <span style={{ color: '#aaa', fontSize: '0.9rem' }}>Detected ODO:</span>
                                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{analysisResult.mileage.toLocaleString()} km</p>
                                    <p style={{ color: '#888', fontSize: '0.8rem' }}>(Your vehicle mileage was automatically updated)</p>
                                </div>
                            )}

                            {analysisResult.score !== undefined && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <span style={{ color: '#aaa', fontSize: '0.9rem' }}>Health Score:</span>
                                    <p style={{
                                        fontSize: '2rem',
                                        fontWeight: 'bold',
                                        color: analysisResult.score >= 90 ? '#00ffd5' : analysisResult.score >= 60 ? '#ffeb3b' : '#ff4444'
                                    }}>
                                        {analysisResult.score} / 100
                                    </p>
                                </div>
                            )}

                            {analysisResult.feedback && (
                                <div>
                                    <span style={{ color: '#aaa', fontSize: '0.9rem' }}>Diagnostic Feedback:</span>
                                    <p style={{ lineHeight: '1.5', marginTop: '0.5rem' }}>{analysisResult.feedback}</p>
                                </div>
                            )}
                        </div>
                    )}
                </section>

            </div>

            <BottomNav />
        </div>
    );
}

export default HealthPage;
