import React, { useRef, useEffect, useState } from 'react';
import './TouchSlider.css';

interface TouchSliderProps {
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (value: number) => void;
}

const TouchSlider: React.FC<TouchSliderProps> = ({ min, max, step, value, onChange }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const calculateValue = (clientX: number) => {
        if (!trackRef.current) return;

        const rect = trackRef.current.getBoundingClientRect();
        // Calculate percentage of movement along the track
        let percentage = (clientX - rect.left) / rect.width;
        percentage = Math.max(0, Math.min(1, percentage)); // Clamp between 0 and 1

        // Calculate raw value
        const rawValue = min + percentage * (max - min);

        // Round to nearest step
        const steppedValue = Math.round((rawValue - min) / step) * step + min;

        // Final clamp
        const finalValue = Math.max(min, Math.min(max, steppedValue));
        onChange(finalValue);
    };

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        setIsDragging(true);
        if ('touches' in e) {
            calculateValue(e.touches[0].clientX);
        } else {
            calculateValue(e.clientX);
        }
    };

    useEffect(() => {
        const handleTouchMove = (e: TouchEvent | MouseEvent) => {
            if (!isDragging) return;

            // Prevent scrolling while dragging the slider
            if (e.cancelable) {
                e.preventDefault();
            }

            if ('touches' in e) {
                calculateValue(e.touches[0].clientX);
            } else {
                calculateValue(e.clientX);
            }
        };

        const handleTouchEnd = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleTouchMove, { passive: false });
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('mouseup', handleTouchEnd);
            window.addEventListener('touchend', handleTouchEnd);
        }

        return () => {
            window.removeEventListener('mousemove', handleTouchMove);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('mouseup', handleTouchEnd);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isDragging, min, max, step]);

    const progress = ((value - min) / (max - min)) * 100;

    return (
        <div
            className="touch-slider-container"
            ref={trackRef}
            onMouseDown={handleTouchStart}
            onTouchStart={handleTouchStart}
        >
            <div className="touch-slider-track">
                <div
                    className="touch-slider-fill"
                    style={{ width: `${progress}%` }}
                />
            </div>
            <div
                className="touch-slider-thumb"
                style={{ left: `${progress}%` }}
            />
        </div>
    );
};

export default TouchSlider;
