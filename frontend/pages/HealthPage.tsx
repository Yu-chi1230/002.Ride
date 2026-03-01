import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import { apiFetch } from '../src/lib/api';
import './HealthPage.css';

const RECORDING_DURATION = 5; // 秒
const NUM_BARS = 40;

function HealthPage() {
    const navigate = useNavigate();
    const [currentMode, setCurrentMode] = useState<'audio' | 'camera'>('audio');

    // ===== Engine Sound States =====
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(RECORDING_DURATION);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);
    const [engineResult, setEngineResult] = useState<any | null>(null);
    const [waveformHeights, setWaveformHeights] = useState<number[]>(new Array(NUM_BARS).fill(4));

    // Refs for MediaRecorder & Web Audio
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ===== Visual Inspection States =====
    const [logType, setLogType] = useState<'meter' | 'tire' | 'chain' | 'plug' | 'engine'>('meter');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any | null>(null);

    // ===== Cleanup on unmount =====
    useEffect(() => {
        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    // ===== リアルタイム波形描画 =====
    const drawWaveform = useCallback(() => {
        if (!analyserRef.current) return;

        const analyser = analyserRef.current;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        // 周波数データをNUM_BARS個に集約
        const step = Math.floor(dataArray.length / NUM_BARS);
        const newHeights = [];
        for (let i = 0; i < NUM_BARS; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) {
                sum += dataArray[i * step + j];
            }
            const avg = sum / step;
            // 0〜255 → 4〜100 (%)
            const height = Math.max(4, (avg / 255) * 100);
            newHeights.push(height);
        }
        setWaveformHeights(newHeights);

        animationFrameRef.current = requestAnimationFrame(drawWaveform);
    }, []);

    // ===== 録音開始 =====
    const startRecording = useCallback(async () => {
        try {
            setEngineResult(null);
            setAudioBlob(null);
            setAudioUrl(null);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Web Audio API でリアルタイム波形用のAnalyserNodeを作成
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            // MediaRecorder で録音
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
                setAudioBlob(blob);
                setAudioUrl(URL.createObjectURL(blob));
                // マイクを開放
                stream.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(RECORDING_DURATION);

            // リアルタイム波形描画を開始
            drawWaveform();

            // カウントダウンタイマー
            let timeLeft = RECORDING_DURATION;
            timerRef.current = setInterval(() => {
                timeLeft -= 1;
                setRecordingTime(timeLeft);
                if (timeLeft <= 0) {
                    stopRecording();
                }
            }, 1000);

        } catch (error) {
            console.error('Microphone access error:', error);
            alert('マイクへのアクセスが許可されていません。ブラウザの設定を確認してください。');
        }
    }, [drawWaveform]);

    // ===== 録音停止 =====
    const stopRecording = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        setWaveformHeights(new Array(NUM_BARS).fill(4));
    }, []);

    // ===== 録音トグル =====
    const handleRecordToggle = useCallback(() => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }, [isRecording, startRecording, stopRecording]);

    // ===== エンジン音解析送信 =====
    const handleAnalyzeAudio = async () => {
        if (!audioBlob) return;

        setIsAnalyzingAudio(true);
        setEngineResult(null);

        const formData = new FormData();
        formData.append('audio', audioBlob, 'engine_sound.webm');

        try {
            const response = await apiFetch('/api/health/analyze-audio', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                setEngineResult(data.data.analysis);
            } else {
                alert('エンジン音の解析に失敗しました');
            }
        } catch (error) {
            console.error('Engine sound analysis error:', error);
            alert('エンジン音解析中にエラーが発生しました');
        } finally {
            setIsAnalyzingAudio(false);
        }
    };

    // ===== 画像変更ハンドラ =====
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            setAnalysisResult(null);
        }
    };

    // ===== 画像解析送信 =====
    const handleAnalyze = async () => {
        if (!imageFile) return;

        setIsAnalyzing(true);
        setAnalysisResult(null);

        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('log_type', logType);

        try {
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
                        エンジン診断
                    </button>
                    <button
                        className={`mode-btn ${currentMode === 'camera' ? 'active' : ''}`}
                        onClick={() => setCurrentMode('camera')}
                    >
                        目視点検
                    </button>
                </div>

                {/* ==================== Engine Sound Section ==================== */}
                <section className={`audio-section ${currentMode === 'audio' ? 'active-section' : 'inactive-section'}`}>
                    <div className="audio-instruction">
                        <h3>HEARTBEAT</h3>
                        <p>エンジンを始動し、録音ボタンを押してください</p>
                    </div>

                    {/* リアルタイム波形 */}
                    <div className={`waveform-container ${isRecording ? 'recording' : ''}`}>
                        {waveformHeights.map((h, i) => (
                            <div
                                key={i}
                                className="waveform-bar"
                                style={{
                                    height: `${h}%`,
                                    transition: isRecording ? 'height 0.1s ease' : 'height 0.5s ease'
                                }}
                            />
                        ))}
                    </div>

                    {/* 録音ボタン */}
                    <button
                        className={`record-btn ${isRecording ? 'recording' : ''}`}
                        onClick={handleRecordToggle}
                    >
                        <div className="record-inner"></div>
                    </button>

                    {/* カウントダウン */}
                    {isRecording && (
                        <p className="recording-status">RECORDING... ({recordingTime}S)</p>
                    )}

                    {/* 録音済みプレビュー */}
                    {audioUrl && !isRecording && (
                        <div style={{ marginTop: '2rem', textAlign: 'center', width: '100%' }}>
                            <audio controls src={audioUrl} style={{ width: '100%', maxWidth: '300px', marginBottom: '1rem', outline: 'none' }} />


                            <button
                                onClick={handleAnalyzeAudio}
                                disabled={isAnalyzingAudio}
                                className="minimal-btn-primary"
                                style={{
                                    maxWidth: '300px',
                                    margin: '0 auto'
                                }}
                            >
                                {isAnalyzingAudio ? '解析中...' : '診断を開始する'}
                            </button>
                        </div>
                    )}

                    {/* エンジン音解析結果 */}
                    {engineResult && (
                        <div className="analysis-result fade-in analysis-result-card" style={{
                            borderTop: `2px solid ${engineResult.score && engineResult.score < 0.6 ? '#E5534B' : '#D4AF37'}`
                        }}>
                            <h4 style={{ color: '#D4AF37', marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 300, letterSpacing: '0.1em' }}>DIAGNOSTIC REPORT</h4>

                            {engineResult.score !== undefined && (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <span style={{ color: '#8B949E', fontSize: '0.85rem', letterSpacing: '0.05em' }}>エンジン健康度 (Health Score)</span>
                                    <p style={{
                                        fontSize: '2.5rem',
                                        fontWeight: '300',
                                        color: engineResult.score >= 0.8 ? '#E6EDF3' : engineResult.score >= 0.6 ? '#D4AF37' : '#E5534B',
                                        fontFamily: "'Roboto Mono', monospace",
                                        marginTop: '0.2rem'
                                    }}>
                                        {Math.round(engineResult.score * 100)} <span style={{ fontSize: '1rem', color: '#8B949E' }}>/ 100</span>
                                    </p>
                                </div>
                            )}

                            {engineResult.feedback && (
                                <div>
                                    <span style={{ color: '#8B949E', fontSize: '0.85rem', letterSpacing: '0.05em' }}>AI所見 (Feedback)</span>
                                    <p style={{ lineHeight: '1.8', margin: '0.5rem 0 0 0', fontWeight: 300, fontSize: '0.95rem' }}>{engineResult.feedback}</p>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* ==================== Visual Check Section ==================== */}
                <section className={`camera-section ${currentMode === 'camera' ? 'active-section' : 'inactive-section'}`}>
                    <div className="camera-instruction">
                        <h3>VISUAL INSPECTION</h3>
                        <p>対象パーツを選択し、画像をアップロードしてください</p>
                    </div>

                    <div className="inspection-form" style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}>
                        <div className="form-group" style={{ marginBottom: '2rem' }}>
                            <label style={{ color: '#8B949E', fontSize: '0.85rem', display: 'block', marginBottom: '0.8rem', letterSpacing: '0.05em' }}>点検箇所の選択 (Target Component)</label>
                            <select
                                value={logType}
                                onChange={(e) => setLogType(e.target.value as any)}
                                className="minimal-select"
                            >
                                <option value="meter">メーター (ODO / Mileage)</option>
                                <option value="tire">タイヤ (Tire)</option>
                                <option value="chain">ドライブチェーン (Chain)</option>
                                <option value="plug">スパークプラグ (Spark Plug)</option>
                                <option value="engine">エンジンブロック (Engine Block)</option>
                            </select>
                        </div>

                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            {/* Hidden file inputs */}
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                id="health-camera-capture"
                                onChange={handleImageChange}
                                style={{ display: 'none' }}
                            />
                            <input
                                type="file"
                                accept="image/*"
                                id="health-gallery-upload"
                                onChange={handleImageChange}
                                style={{ display: 'none' }}
                            />

                            {previewUrl ? (
                                <div className="image-preview-area">
                                    <img src={previewUrl} alt="Preview" />
                                    <button
                                        className="retake-btn"
                                        onClick={() => {
                                            setImageFile(null);
                                            setPreviewUrl(null);
                                            setAnalysisResult(null);
                                        }}
                                    >
                                        再撮影・別画像を選択する
                                    </button>
                                </div>
                            ) : (
                                <div className="image-source-selector">
                                    <label htmlFor="health-camera-capture" className="source-btn">
                                        <span className="source-label">カメラで撮影を起動</span>
                                    </label>
                                    <label htmlFor="health-gallery-upload" className="source-btn">
                                        <span className="source-label">ギャラリーから画像を選択</span>
                                    </label>
                                </div>
                            )}
                        </div>

                        {previewUrl && (
                            <button
                                className="analyze-btn minimal-btn-primary"
                                onClick={handleAnalyze}
                                disabled={isAnalyzing}
                            >
                                {isAnalyzing ? '解析中...' : 'AIによる診断を開始する'}
                            </button>
                        )}
                    </div>

                    {/* Result Display Area */}
                    {analysisResult && (
                        <div className="analysis-result fade-in analysis-result-card" style={{
                            borderTop: `2px solid ${analysisResult.score && analysisResult.score < 0.6 ? '#E5534B' : '#D4AF37'}`
                        }}>
                            <h4 style={{ color: '#D4AF37', marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 300, letterSpacing: '0.1em' }}>ANALYSIS REPORT</h4>

                            {analysisResult.mileage !== undefined && (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <span style={{ color: '#8B949E', fontSize: '0.85rem', letterSpacing: '0.05em' }}>検出された走行距離 (Mileage)</span>
                                    <p style={{ fontSize: '2rem', fontWeight: '300', fontFamily: "'Roboto Mono', monospace", marginTop: '0.2rem' }}>
                                        {analysisResult.mileage.toLocaleString()} <span style={{ fontSize: '1rem', color: '#8B949E' }}>km</span>
                                    </p>
                                    <p style={{ color: '#8B949E', fontSize: '0.8rem', marginTop: '0.2rem' }}>※メーター情報は自動的に更新されました</p>
                                </div>
                            )}

                            {analysisResult.score !== undefined && (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <span style={{ color: '#8B949E', fontSize: '0.85rem', letterSpacing: '0.05em' }}>パーツ健康度 (Health Score)</span>
                                    <p style={{
                                        fontSize: '2.5rem',
                                        fontWeight: '300',
                                        color: analysisResult.score >= 0.8 ? '#E6EDF3' : analysisResult.score >= 0.6 ? '#D4AF37' : '#E5534B',
                                        fontFamily: "'Roboto Mono', monospace",
                                        marginTop: '0.2rem'
                                    }}>
                                        {Math.round(analysisResult.score * 100)} <span style={{ fontSize: '1rem', color: '#8B949E' }}>/ 100</span>
                                    </p>
                                </div>
                            )}

                            {analysisResult.feedback && (
                                <div>
                                    <span style={{ color: '#8B949E', fontSize: '0.85rem', letterSpacing: '0.05em' }}>AI所見 (Feedback)</span>
                                    <p style={{ lineHeight: '1.8', margin: '0.5rem 0 0 0', fontWeight: 300, fontSize: '0.95rem' }}>{analysisResult.feedback}</p>
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
