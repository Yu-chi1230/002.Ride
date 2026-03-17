import React, { useState, useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import BottomNav from '../components/BottomNav';
import './CreatePage.css';

// CSS filter equivalent for themes to use with Canvas API for export
const THEMES = [
    {
        id: 'original',
        name: 'Original',
        filter: 'none',
        img: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=400&q=80'
    },
    {
        id: 'cyberpunk',
        name: 'Cyberpunk',
        filter: 'contrast(1.2) saturate(1.4) hue-rotate(-15deg)',
        img: 'https://images.unsplash.com/photo-1555626906-fcf10d6851b4?w=400&q=80'
    },
    {
        id: 'vintage',
        name: 'Vintage',
        filter: 'sepia(0.3) contrast(1.1) brightness(0.9) saturate(0.8)',
        img: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=400&q=80'
    },
    {
        id: 'action',
        name: 'Action Movie',
        filter: 'contrast(1.3) saturate(0.8) brightness(0.9)',
        img: 'https://images.unsplash.com/photo-1583120155095-200424d5ba7a?w=400&q=80'
    },
    {
        id: 'romantic',
        name: 'Romantic',
        filter: 'brightness(1.1) contrast(0.9) saturate(0.9) sepia(0.1)',
        img: 'https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?w=400&q=80'
    }
];

function CreatePage() {
    // State
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [selectedThemeId, setSelectedThemeId] = useState<string>(THEMES[0].id);
    const [sliderValue, setSliderValue] = useState(50); // 0-100%
    const [isExporting, setIsExporting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const filesArray = Array.from(e.target.files);
            const urls = filesArray.map(f => URL.createObjectURL(f));
            setPreviewUrls(prev => [...prev, ...urls]);

            // If it's the first upload, select the first image
            if (previewUrls.length === 0) {
                setSelectedImageIndex(0);
                setSliderValue(50); // reset slider
            }
        }
        // 同じ画像を再度選択できるように値をリセット
        e.target.value = '';
    };

    const handleReplaceSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const url = URL.createObjectURL(file);
            setPreviewUrls(prev => {
                const newUrls = [...prev];
                newUrls[selectedImageIndex] = url;
                return newUrls;
            });
            setSliderValue(50);
        }
        // 同じ画像を再度選択できるように値をリセット
        e.target.value = '';
    };

    const handleRemoveImage = () => {
        setPreviewUrls(prev => {
            const newUrls = [...prev];
            newUrls.splice(selectedImageIndex, 1);

            // Adjust selected index if we removed the last item or the end of the list
            if (newUrls.length === 0) {
                // Return to upload state automatically
                setSelectedImageIndex(0);
            } else if (selectedImageIndex >= newUrls.length) {
                setSelectedImageIndex(newUrls.length - 1);
            }
            return newUrls;
        });
        setSliderValue(50);
    };

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSliderValue(Number(e.target.value));
    };

    const handleDownload = async () => {
        if (!imageRef.current || !canvasRef.current || previewUrls.length === 0) return;

        setIsExporting(true);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const imgElement = imageRef.current;

        if (!ctx) {
            alert('Canvas export is not supported in this browser.');
            setIsExporting(false);
            return;
        }

        try {
            // Set canvas size to original image resolution
            canvas.width = imgElement.naturalWidth;
            canvas.height = imgElement.naturalHeight;

            const selectedTheme = THEMES.find(t => t.id === selectedThemeId);
            if (selectedTheme) {
                // Apply the CSS filter equivalent to the Canvas context
                ctx.filter = selectedTheme.filter;
            }

            // Draw image onto canvas with filter
            ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

            // Export to blob and trigger download
            canvas.toBlob((blob) => {
                if (!blob) throw new Error('Canvas to Blob failed');

                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ride_cinematic_${Date.now()}.jpg`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                setIsExporting(false);
            }, 'image/jpeg', 0.95);

        } catch (err) {
            console.error('Export error:', err);
            alert('画像の保存に失敗しました。');
            setIsExporting(false);
        }
    };

    // ========== Render ==========

    const activeTheme = THEMES.find(t => t.id === selectedThemeId);
    const currentImageUrl = previewUrls[selectedImageIndex];

    return (
        <div className="create-page">
            <header className="create-header">
                {selectedThemeId !== 'original' && previewUrls.length > 0 && (
                    <div className="badge-before" style={{ position: 'relative', bottom: 0, left: 0, opacity: sliderValue > 20 ? 1 : 0 }}>BEFORE</div>
                )}

                <h1 className="create-title">Create Editor</h1>

                {selectedThemeId !== 'original' && previewUrls.length > 0 && (
                    <div className="badge-after" style={{ position: 'relative', bottom: 0, right: 0, opacity: sliderValue < 80 ? 1 : 0 }}>AFTER</div>
                )}
            </header>

            {/* Always show Editor State */}
            <div className="editor-container">
                {/* Main View Area: Either Image or Upload Button */}
                <div className="viewport-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {previewUrls.length === 0 ? (
                        <div
                            className="upload-box"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ width: '100%', aspectRatio: '16/9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px dashed rgba(255,255,255,0.2)', backgroundColor: 'rgba(13, 17, 23, 0.5)' }}
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
                            {/* Background Image (Before) */}
                            <img
                                src={currentImageUrl}
                                alt="Before"
                                className="img-before"
                                style={{ filter: 'none' }}
                            />

                            {/* Foreground Image (After) - Clipped based on slider */}
                            <img
                                src={currentImageUrl}
                                alt="After"
                                className="img-after"
                                style={{
                                    clipPath: `inset(0 0 0 ${sliderValue}%)`,
                                    filter: activeTheme?.filter || 'none'
                                }}
                            />

                            {/* Slider UI */}
                            {selectedThemeId !== 'original' && (
                                <>
                                    <div className="slider-handle-line" style={{ left: `${sliderValue}%` }} />
                                    {/* Make sure the visual button has pointer-events: none in CSS */}
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

                {/* Thumbnail Selector & Actions */}
                {previewUrls.length > 0 && (
                    <div className="toolbar-section">
                        <div className="section-label">SELECTED PICTURES</div>
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                            <div className="image-selector" style={{ margin: 0, paddingLeft: '1.2rem', paddingRight: '0.4rem', flex: 1, minWidth: 0 }}>
                                {previewUrls.map((url, idx) => (
                                    <img
                                        key={idx}
                                        src={url}
                                        alt={`thumb ${idx}`}
                                        className={`thumb-item ${selectedImageIndex === idx ? 'active' : ''}`}
                                        onClick={() => {
                                            setSelectedImageIndex(idx);
                                            setSliderValue(50); // reset slider for new image
                                        }}
                                    />
                                ))}
                                {/* Simple add button for more photos */}
                                <div
                                    className="thumb-item"
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid rgba(212, 175, 55, 0.3)', color: '#D4AF37', fontSize: '1.2rem', opacity: 1, fontWeight: 300, flexShrink: 0 }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    +
                                </div>
                            </div>
                            {/* Action buttons for current image */}
                            <div className="current-image-actions" style={{
                                flexShrink: 0,
                                margin: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'stretch',
                                justifyContent: 'space-between',
                                height: '60px', /* Match thumb-item height */
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

                {/* Themes Tool bar */}
                <div className="toolbar-section">
                    <div className="section-label">COLOR GRADING PRESETS</div>
                    <div className="theme-scroller">
                        {THEMES.map(theme => (
                            <div
                                key={theme.id}
                                className={`theme-card ${selectedThemeId === theme.id ? 'active' : ''}`}
                                style={{ backgroundImage: `url(${theme.img})` }}
                                onClick={() => setSelectedThemeId(theme.id)}
                            >
                                <div className="theme-card-overlay" />
                                <div className="theme-card-title">{theme.name}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="action-buttons">
                    <button
                        className="btn-primary"
                        onClick={handleDownload}
                        disabled={isExporting || previewUrls.length === 0}
                    >
                        {isExporting ? '保存中...' : '画像を保存する'}
                    </button>
                    <button className="btn-secondary" disabled={previewUrls.length === 0}>
                        シェアする
                    </button>
                </div>

                {/* Hidden canvas for export */}
                <canvas ref={canvasRef} className="export-canvas" />
            </div>

            {/* Hidden file input for uploads */}
            <input
                type="file"
                multiple
                accept="image/*"
                ref={fileInputRef}
                className="hidden-file-input"
                onChange={handleFileSelect}
            />

            {/* Hidden file input for replace (single) */}
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
