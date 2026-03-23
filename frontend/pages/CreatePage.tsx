import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import BottomNav from '../components/BottomNav';
import { apiFetch } from '../src/lib/api';
import './CreatePage.css';

const THEMES = [
    {
        id: 'cyberpunk',
        name: 'Cyberpunk',
        img: 'https://images.unsplash.com/photo-1555626906-fcf10d6851b4?w=400&q=80'
    },
    {
        id: 'vintage',
        name: 'Vintage',
        img: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=400&q=80'
    },
    {
        id: 'action',
        name: 'Action Movie',
        img: 'https://images.unsplash.com/photo-1583120155095-200424d5ba7a?w=400&q=80'
    },
    {
        id: 'romantic',
        name: 'Romantic',
        img: 'https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?w=400&q=80'
    }
] as const;

type ThemeId = typeof THEMES[number]['id'];

type CreateImageItem = {
    file: File;
    previewUrl: string;
    processedUrl: string | null;
};

type ProcessedImageResponse = {
    index: number;
    filename: string;
    mime_type: string;
    data_url: string;
};

const getLivePreviewFilter = (themeId: ThemeId, intensity: number) => {
    const t = Math.max(0, Math.min(100, intensity)) / 100;
    switch (themeId) {
        case 'cyberpunk':
            return `saturate(${1 + t * 0.8}) contrast(${1 + t * 0.45}) hue-rotate(${t * 18}deg)`;
        case 'vintage':
            return `saturate(${1 - t * 0.35}) sepia(${t * 0.35}) contrast(${1 + t * 0.12})`;
        case 'action':
            return `contrast(${1 + t * 0.6}) saturate(${1 - t * 0.2}) brightness(${1 - t * 0.1})`;
        case 'romantic':
            return `brightness(${1 + t * 0.18}) saturate(${1 - t * 0.12}) sepia(${t * 0.2})`;
        default:
            return 'none';
    }
};

function CreatePage() {
    const [image, setImage] = useState<CreateImageItem | null>(null);
    const [selectedThemeId, setSelectedThemeId] = useState<ThemeId>(THEMES[0].id);
    const [intensityValue, setIntensityValue] = useState(50);
    const [sliderValue, setSliderValue] = useState(50);
    const [isIntensitySliding, setIsIntensitySliding] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const scheduleTimerRef = useRef<number | null>(null);
    const latestGenerateRequestRef = useRef(0);
    const activeAbortRef = useRef<AbortController | null>(null);
    const currentImageUrl = image?.previewUrl ?? null;
    const currentProcessedUrl = image?.processedUrl ?? null;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            setImage({
                file,
                previewUrl: URL.createObjectURL(file),
                processedUrl: null
            });
            setSelectedThemeId('cyberpunk');
            setIntensityValue(50);
            setSliderValue(50);
            if (scheduleTimerRef.current !== null) {
                window.clearTimeout(scheduleTimerRef.current);
            }
            scheduleTimerRef.current = window.setTimeout(() => {
                void generateImage({ themeId: 'cyberpunk', intensity: 50, auto: true, fileOverride: file });
            }, 150);
        }
        e.target.value = '';
    };

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSliderValue(Number(e.target.value));
    };

    const handleThemeChange = (themeId: ThemeId) => {
        setSelectedThemeId(themeId);
        setSliderValue(50);
    };

    const generateImage = async (params: { themeId: ThemeId; intensity: number; auto: boolean; fileOverride?: File }) => {
        const sourceFile = params.fileOverride ?? image?.file;
        if (!sourceFile) {
            return;
        }

        if (activeAbortRef.current) {
            activeAbortRef.current.abort();
        }
        const controller = new AbortController();
        activeAbortRef.current = controller;

        const requestId = ++latestGenerateRequestRef.current;
        const targetFile = sourceFile;

        try {
            const formData = new FormData();
            formData.append('theme', params.themeId);
            formData.append('intensity', String(params.intensity));
            formData.append('images', targetFile);

            const response = await apiFetch('/api/create/generate', {
                method: 'POST',
                body: formData,
                timeoutMs: 60000,
                signal: controller.signal
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || '画像変換に失敗しました。');
            }

            const processedImages = Array.isArray(data?.data?.processed_images)
                ? data.data.processed_images as ProcessedImageResponse[]
                : [];

            const processed = processedImages.find((entry) => entry.index === 0);
            if (requestId === latestGenerateRequestRef.current) {
            setImage((prev) => {
                if (!prev) return prev;
                if (params.fileOverride) {
                    return { ...prev, processedUrl: processed?.data_url ?? null };
                }
                return prev.file === targetFile
                    ? { ...prev, processedUrl: processed?.data_url ?? null }
                    : prev;
            });
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                return;
            }
            console.error('Create generate error:', error);
            if (params.auto) {
                // Auto mode errors are intentionally not surfaced in UI.
            } else {
                alert(error?.message || '画像変換に失敗しました。');
            }
        } finally {
            if (requestId === latestGenerateRequestRef.current) {
            }
        }
    };

    const scheduleSharpGenerate = (delayMs = 180, overrides?: { themeId?: ThemeId; intensity?: number }) => {
        if (!image) {
            return;
        }
        if (scheduleTimerRef.current !== null) {
            window.clearTimeout(scheduleTimerRef.current);
        }
        scheduleTimerRef.current = window.setTimeout(() => {
            void generateImage({
                themeId: overrides?.themeId ?? selectedThemeId,
                intensity: overrides?.intensity ?? intensityValue,
                auto: true
            });
        }, delayMs);
    };

    useEffect(() => {
        return () => {
            if (scheduleTimerRef.current !== null) {
                window.clearTimeout(scheduleTimerRef.current);
            }
            if (activeAbortRef.current) {
                activeAbortRef.current.abort();
            }
        };
    }, []);

    const handleDownload = () => {
        if (!currentImageUrl) {
            return;
        }

        const downloadUrl = currentProcessedUrl ?? currentImageUrl;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `ride_styled_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="create-page">
            <header className="create-header">
                {image && (
                    <div className="badge-before" style={{ position: 'relative', bottom: 0, left: 0, opacity: sliderValue > 20 ? 1 : 0 }}>BEFORE</div>
                )}

                <h1 className="create-title">Create Editor</h1>

                {image && (
                    <div className="badge-after" style={{ position: 'relative', bottom: 0, right: 0, opacity: sliderValue < 80 ? 1 : 0 }}>AFTER</div>
                )}
            </header>

            <div className="editor-container">
                <div className="viewport-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {!image ? (
                        <div
                            className="upload-box"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ width: '80%', aspectRatio: '16/9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px dashed rgba(255,255,255,0.2)', backgroundColor: 'rgba(13, 17, 23, 0.5)' }}
                        >
                            <div className="upload-icon" style={{ marginBottom: '1rem', color: '#8B949E' }}>
                                <ImagePlus strokeWidth={1.5} size={48} />
                            </div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 300, marginBottom: '0.8rem', letterSpacing: '0.15em', color: '#E6EDF3' }}>ADD PHOTOS</div>
                            <div style={{ fontSize: '0.9rem', color: '#8B949E', fontWeight: 300, letterSpacing: '0.05em', lineHeight: 1.6, textAlign: 'center' }}>
                                タップして画像を選択
                            </div>
                        </div>
                    ) : (
                        <div className="comparison-wrapper">
                            {currentImageUrl && (
                                <img
                                    src={currentImageUrl}
                                    alt="Before"
                                    className="img-before"
                                    style={{ filter: 'none' }}
                                />
                            )}

                            {currentProcessedUrl && (
                                <img
                                    src={currentProcessedUrl}
                                    alt="After"
                                    className="img-after"
                                    style={{
                                        clipPath: `inset(0 0 0 ${sliderValue}%)`,
                                        filter: isIntensitySliding ? getLivePreviewFilter(selectedThemeId, intensityValue) : 'none',
                                    }}
                                />
                            )}

                            {currentProcessedUrl && (
                                <>
                                    <div className="slider-handle-line" style={{ left: `${sliderValue}%` }} />
                                    <div className="slider-handle-button" style={{ left: `${sliderValue}%` }}>
                                        <span style={{ transform: 'scaleX(1.5)', display: 'inline-block' }}>|</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={sliderValue}
                                        onChange={handleSliderChange}
                                        className="comparison-slider"
                                    />
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="toolbar-section">
                    <div className="section-label">COLOR GRADING PRESETS</div>
                    <div className="theme-scroller">
                        {THEMES.map((theme) => (
                            <div
                                key={theme.id}
                                className={`theme-card ${selectedThemeId === theme.id ? 'active' : ''}`}
                                style={{ backgroundImage: `url(${theme.img})` }}
                                onClick={() => {
                                    handleThemeChange(theme.id);
                                    scheduleSharpGenerate(180, { themeId: theme.id });
                                }}
                            >
                                <div className="theme-card-overlay" />
                                <div className="theme-card-title">{theme.name}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="toolbar-section">
                    <div className="section-label">STRENGTH</div>
                    <div style={{ margin: '0 1.2rem 1rem', padding: '0.6rem 0.8rem', border: '1px solid rgba(212, 175, 55, 0.22)', background: 'rgba(22, 27, 34, 0.75)' }}>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={intensityValue}
                            onChange={(e) => setIntensityValue(Number(e.target.value))}
                            onPointerDown={() => {
                                setIsIntensitySliding(true);
                            }}
                            onPointerUp={() => {
                                setIsIntensitySliding(false);
                                scheduleSharpGenerate(120);
                            }}
                            onTouchStart={() => {
                                setIsIntensitySliding(true);
                            }}
                            onTouchEnd={() => {
                                setIsIntensitySliding(false);
                                scheduleSharpGenerate(120);
                            }}
                            onMouseDown={() => {
                                setIsIntensitySliding(true);
                            }}
                            onMouseUp={() => {
                                setIsIntensitySliding(false);
                                scheduleSharpGenerate(120);
                            }}
                            onBlur={() => {
                                setIsIntensitySliding(false);
                                scheduleSharpGenerate(120);
                            }}
                            style={{ width: '100%' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.45rem', fontSize: '0.74rem', color: '#8B949E' }}>
                            <span>弱め</span>
                            <span>標準</span>
                            <span>強め</span>
                        </div>
                        <div style={{ marginTop: '0.35rem', textAlign: 'right', fontSize: '0.78rem', color: '#E6EDF3' }}>
                            現在値: {intensityValue}
                        </div>
                    </div>
                </div>

                <div className="action-buttons">
                    <button
                        className="btn-primary"
                        style={{ width: '100%', marginTop: '0.5rem' }}
                        onClick={handleDownload}
                        disabled={!image}
                    >
                        画像を保存する
                    </button>
                </div>
            </div>

            <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden-file-input"
                onChange={handleFileSelect}
            />

            <BottomNav />
        </div>
    );
}

export default CreatePage;
