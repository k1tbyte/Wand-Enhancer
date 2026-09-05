import { type PointerEvent, useRef } from 'react';
import { clampToStep } from './step';

const DRAG_THRESHOLD = 8;

type SliderGesture = {
    pointerId: number;
    x: number;
    y: number;
    value: number;
    dragging: boolean;
};

export function useSliderGesture(
    value: number,
    min: number,
    max: number,
    step: number,
    disabled: boolean,
    onChange: (value: number) => void,
) {
    const gesture = useRef<SliderGesture | null>(null);

    const move = (event: PointerEvent<HTMLDivElement>) => {
        const start = gesture.current;
        if (!start || start.pointerId !== event.pointerId || disabled) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.dragging) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_THRESHOLD) return;
            if (Math.abs(dy) >= Math.abs(dx)) {
                gesture.current = null;
                return;
            }
            start.dragging = true;
        }
        const width = event.currentTarget.getBoundingClientRect().width;
        if (width > 0)
            onChange(clampToStep(start.value + (dx / width) * (max - min), min, max, step));
    };

    return {
        onPointerDown(event: PointerEvent<HTMLDivElement>) {
            if (disabled || event.button > 0 || gesture.current) return;
            // The tile swipe gesture must not steal the slider drag.
            event.stopPropagation();
            gesture.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                value,
                dragging: false,
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
        },
        onPointerMove: move,
        onPointerUp(event: PointerEvent<HTMLDivElement>) {
            if (gesture.current?.pointerId !== event.pointerId) return;
            move(event);
            gesture.current = null;
        },
        onPointerCancel() {
            gesture.current = null;
        },
        onLostPointerCapture() {
            gesture.current = null;
        },
    };
}
