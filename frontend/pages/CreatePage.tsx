import React, { useMemo, useRef, useState } from 'react';
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

function CreatePage() {
    const [images, setImages] = useState<CreateImageItem[]>([]);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [selectedThemeId, setSelectedThemeId] = useState<ThemeId>(THEMES[0].id);
    const [sliderValue, setSliderValue] = useState(50);
    const [isGenerating, setIsGenerating] = useState(false);
    const [colorLogicMemo, setColorLogicMemo] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);

    const currentImage = images[selectedImageIndex] ?? null;
    const currentImageUrl = currentImage?.previewUrl ?? null;
    const currentProcessedUrl = currentImage?.processedUrl ?? null;

    const hasProcessedImages = useMemo(
        () => images.some((image) => image.processedUrl !== null),
        [images]
    );

    const appendFiles = (files: File[]) => {
        const nextItems = files.map((file) => ({
            file,
            previewUrl: URL.createObjectURL(file),
            processedUrl: null
        }));

        setImages((prev) => {
            const next = [...prev, ...nextItems];
            if (prev.length === 0 && next.length > 0) {
                setSelectedImageIndex(0);
            }
            return next;
        });
        setSliderValue(50);
        setColorLogicMemo(null);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            appendFiles(Array.from(e.target.files));
        }
        e.target.value = '';
    };

    const handleReplaceSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const nextItem: CreateImageItem = {
                file,
                previewUrl: URL.createObjectURL(file),
                processedUrl: null
            };

            setImages((prev) => prev.map((item, index) => (
                index === selectedImageIndex ? nextItem : item
            )));
            setSliderValue(50);
            setColorLogicMemo(null);
        }
        e.target.value = '';
    };

    const handleRemoveImage = () => {
        setImages((prev) => {
            const next = prev.filter((_, index) => index !== selectedImageIndex);
            if (next.length === 0) {
                setSelectedImageIndex(0);
            } else if (selectedImageIndex >= next.length) {
                setSelectedImageIndex(next.length - 1);
            }
            return next;
        });
        setSliderValue(50);
        setColorLogicMemo(null);
    };

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSliderValue(Number(e.target.value));
    };

    const handleThemeChange = (themeId: ThemeId) => {
        setSelectedThemeId(themeId);
        setSliderValue(50);
        if (!hasProcessedImages) {
            setColorLogicMemo(null);
        }
    };

    const handleGenerate = async () => {
        if (images.length === 0 || isGenerating) {
            return;
        }

        setIsGenerating(true);
        setColorLogicMemo(null);

        try {
            const formData = new FormData();
            formData.append('theme', selectedThemeId);
            images.forEach((image) => {
                formData.append('images', image.file);
            });

            const response = await apiFetch('/api/create/generate', {
                method: 'POST',
                body: formData,
                timeoutMs: 60000
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(data?.error || '画像変換に失敗しました。');
            }

            const processedImages = Array.isArray(data?.data?.processed_images)
                ? data.data.processed_images as ProcessedImageResponse[]
                : [];

            setImages((prev) => prev.map((item, index) => {
                const processed = processedImages.find((entry) => entry.index === index);
                return {
                    ...item,
                    processedUrl: processed?.data_url ?? null
                };
            }));
            setColorLogicMemo(data?.data?.color_logic_memo ?? null);
        } catch (error: any) {
            console.error('Create generate error:', error);
            alert(error?.message || '画像変換に失敗しました。');
        } finally {
            setIsGenerating(false);
        }
    };

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
                {images.length > 0 && (
                    <div className="badge-before" style={{ position: 'relative', bottom: 0, left: 0, opacity: sliderValue > 20 ? 1 : 0 }}>BEFORE</div>
                )}

                <h1 className="create-title">Create Editor</h1>

                {images.length > 0 && (
                    <div className="badge-after" style={{ position: 'relative', bottom: 0, right: 0, opacity: sliderValue < 80 ? 1 : 0 }}>AFTER</div>
                )}
            </header>

            <div className="editor-container">
                <div className="viewport-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {images.length === 0 ? (
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

                {images.length > 0 && (
                    <div className="toolbar-section">
                        <div className="section-label">SELECTED PICTURES</div>
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                            <div className="image-selector" style={{ margin: 0, paddingLeft: '1.2rem', paddingRight: '0.4rem', flex: 1, minWidth: 0 }}>
                                {images.map((image, idx) => (
                                    <img
                                        key={`${image.previewUrl}-${idx}`}
                                        src={image.processedUrl ?? image.previewUrl}
                                        alt={`thumb ${idx}`}
                                        className={`thumb-item ${selectedImageIndex === idx ? 'active' : ''}`}
                                        onClick={() => {
                                            setSelectedImageIndex(idx);
                                            setSliderValue(50);
                                        }}
                                    />
                                ))}
                                <div
                                    className="thumb-item"
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid rgba(212, 175, 55, 0.3)', color: '#D4AF37', fontSize: '1.2rem', opacity: 1, fontWeight: 300, flexShrink: 0 }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    +
                                </div>
                            </div>
                            <div className="current-image-actions" style={{
                                flexShrink: 0,
                                margin: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'stretch',
                                justifyContent: 'space-between',
                                height: '60px',
                                gap: '0.4rem',
                                paddingLeft: '0.8rem'
                            }}>
                                <span className="action-text-btn" onClick={() => replaceInputRef.current?.click()} style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '0 0.8rem',
                                    borderRadius: '2px',
                                    fontSize: '0.7rem'
                                }}>
                                    CHANGE
                                </span>
                                <span className="action-text-btn action-danger" onClick={handleRemoveImage} style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '0 0.8rem',
                                    borderRadius: '2px',
                                    fontSize: '0.7rem',
                                    backgroundColor: 'rgba(229, 83, 75, 0.1)',
                                    color: '#E5534B'
                                }}>
                                    REMOVE
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="toolbar-section">
                    <div className="section-label">COLOR GRADING PRESETS</div>
                    <div className="theme-scroller">
                        {THEMES.map((theme) => (
                            <div
                                key={theme.id}
                                className={`theme-card ${selectedThemeId === theme.id ? 'active' : ''}`}
                                style={{ backgroundImage: `url(${theme.img})` }}
                                onClick={() => handleThemeChange(theme.id)}
                            >
                                <div className="theme-card-overlay" />
                                <div className="theme-card-title">{theme.name}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {colorLogicMemo && (
                    <div className="toolbar-section" style={{ paddingTop: '0.4rem' }}>
                        <div className="section-label">STYLE NOTE</div>
                        <div style={{
                            margin: '0 1.2rem 1rem',
                            padding: '0.9rem 1rem',
                            border: '1px solid rgba(212, 175, 55, 0.22)',
                            background: 'rgba(22, 27, 34, 0.75)',
                            color: '#E6EDF3',
                            lineHeight: 1.7,
                            fontSize: '0.88rem'
                        }}>
                            {colorLogicMemo}
                        </div>
                    </div>
                )}

                <div className="action-buttons">
                    <button
                        className="btn-primary"
                        onClick={handleGenerate}
                        disabled={isGenerating || images.length === 0}
                    >
                        {isGenerating ? '変換中...' : 'カラー変換を適用'}
                    </button>
                    <button
                        className="btn-secondary"
                        onClick={handleDownload}
                        disabled={images.length === 0}
                    >
                        画像を保存する
                    </button>
                </div>
            </div>

            <input
                type="file"
                multiple
                accept="image/*"
                ref={fileInputRef}
                className="hidden-file-input"
                onChange={handleFileSelect}
            />

            <input
                type="file"
                accept="image/*"
                ref={replaceInputRef}
                className="hidden-file-input"
                onChange={handleReplaceSelect}
            />

            <BottomNav />
        </div>
    );
}

export default CreatePage;
