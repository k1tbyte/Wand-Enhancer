import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CheatSchema, ECheatType } from '../../../protocol/messages';
import { ScalarControl } from './ScalarControl';
import { SliderControl } from './SliderControl';
import { clampToStep } from './step';

afterEach(cleanup);

const cheat: CheatSchema = {
    uuid: 'speed',
    category: 'player',
    target: 'speed',
    type: ECheatType.Slider,
    name: 'Speed',
    args: { min: 0, max: 1000, step: 0.1, postfix: 'x' },
};

function pointer(target: HTMLElement, type: string, x: number, y: number) {
    fireEvent(
        target,
        Object.assign(new Event(type, { bubbles: true }), {
            pointerId: 1,
            pointerType: 'touch',
            button: 0,
            clientX: x,
            clientY: y,
        }),
    );
}

function setup() {
    const onChange = vi.fn();
    render(<SliderControl cheat={cheat} value={10} disabled={false} onChange={onChange} />);
    const track = screen.getByRole('slider').parentElement!;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
        width: 200,
        height: 36,
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 200,
        bottom: 36,
        toJSON() {},
    });
    return { onChange, track };
}

describe('slider controls', () => {
    it('commits exact fractional input only on Enter or blur', () => {
        const { onChange } = setup();
        const input = screen.getByRole('textbox', { name: 'Speed value' });
        fireEvent.input(input, { target: { value: '0.' } });
        expect(onChange).not.toHaveBeenCalled();
        expect((input as HTMLInputElement).value).toBe('0.');
        fireEvent.input(input, { target: { value: '0.3' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenLastCalledWith(0.3);
        fireEvent.input(input, { target: { value: '2000' } });
        act(() => {
            input.focus();
            input.blur();
        });
        expect(onChange).toHaveBeenLastCalledWith(1000);
    });

    it('cancels invalid, empty and escaped drafts', () => {
        const { onChange } = setup();
        const input = screen.getByRole('textbox');
        for (const value of ['', 'bad', '-']) {
            fireEvent.input(input, { target: { value } });
            act(() => {
                input.focus();
                input.blur();
            });
        }
        fireEvent.input(input, { target: { value: '99' } });
        fireEvent.keyDown(input, { key: 'Escape' });
        act(() => {
            input.focus();
            input.blur();
        });
        expect(onChange).not.toHaveBeenCalled();
        expect((input as HTMLInputElement).value).toBe('10');
    });

    it('ignores taps, small movements and vertical scrolling', () => {
        const { onChange, track } = setup();
        pointer(track, 'pointerdown', 180, 0);
        pointer(track, 'pointerup', 180, 0);
        pointer(track, 'pointerdown', 100, 0);
        pointer(track, 'pointermove', 103, 2);
        pointer(track, 'pointermove', 105, 20);
        pointer(track, 'pointermove', 180, 25);
        pointer(track, 'pointerup', 180, 25);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('changes values only after a deliberate horizontal drag', () => {
        const { onChange, track } = setup();
        pointer(track, 'pointerdown', 100, 0);
        pointer(track, 'pointermove', 120, 2);
        expect(onChange).toHaveBeenLastCalledWith(110);
        pointer(track, 'pointercancel', 120, 2);
        onChange.mockClear();
        pointer(track, 'pointermove', 180, 2);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('keeps native keyboard input and disabled behavior', () => {
        const onChange = vi.fn();
        const { rerender } = render(
            <SliderControl cheat={cheat} value={10} disabled={false} onChange={onChange} />,
        );
        fireEvent.input(screen.getByRole('slider'), { target: { value: '10.1' } });
        expect(onChange).toHaveBeenLastCalledWith(10.1);
        rerender(<SliderControl cheat={cheat} value={10} disabled onChange={onChange} />);
        expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
        onChange.mockClear();
        const track = screen.getByRole('slider').parentElement!;
        pointer(track, 'pointerdown', 0, 0);
        pointer(track, 'pointermove', 50, 0);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('provides the same exact input for scalar multipliers', () => {
        const onChange = vi.fn();
        render(<ScalarControl cheat={cheat} value={10} disabled={false} onChange={onChange} />);
        fireEvent.input(screen.getByRole('textbox'), { target: { value: '2.5' } });
        act(() => {
            screen.getByRole('textbox').focus();
            screen.getByRole('textbox').blur();
        });
        expect(onChange).toHaveBeenCalledWith(2.5);
    });

    it('rounds the readout to the slider precision', () => {
        render(<SliderControl cheat={cheat} value={10.069} disabled={false} onChange={vi.fn()} />);
        expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('10.1');
    });

    it('snaps relative to the minimum without fractional drift', () => {
        expect(clampToStep(0.31, 0.1, 1, 0.2)).toBe(0.3);
        expect(clampToStep(3.1e-7, 0, 1, 1e-7)).toBe(3e-7);
    });
});
