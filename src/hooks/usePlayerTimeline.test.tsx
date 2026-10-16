import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePlayerTimeline } from './usePlayerTimeline';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('preserves pointer seeking, clamps to the duration and saves once on release', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  const onSeekEnd = vi.fn();
  function Timeline() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [time, setPlaybackTime] = useState(0);
    const { progressBarRef, handleProgressBarPointerDown, handleProgressBarPointerMove, handleProgressBarPointerUp } = usePlayerTimeline({ duration: 100, videoRef, setPlaybackTime, onSeekEnd });
    return <>
      <video ref={videoRef} data-testid="video" />
      <div ref={progressBarRef} data-testid="timeline"
        onPointerDown={handleProgressBarPointerDown}
        onPointerMove={handleProgressBarPointerMove}
        onPointerUp={handleProgressBarPointerUp} />
      <output>{time}</output>
    </>;
  }
  render(<Timeline />);
  const bar = screen.getByTestId('timeline');
  const video = screen.getByTestId('video') as HTMLVideoElement;
  vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ left: 10, width: 100 } as DOMRect);
  fireEvent.pointerDown(bar, { clientX: 35 });
  expect(video.currentTime).toBe(25);
  fireEvent.pointerMove(bar, { clientX: 200 });
  expect(video.currentTime).toBe(100);
  expect(onSeekEnd).not.toHaveBeenCalled();
  fireEvent.pointerUp(bar, { clientX: -50 });
  expect(video.currentTime).toBe(0);
  expect(onSeekEnd).toHaveBeenCalledTimes(1);
  fireEvent.pointerUp(bar, { clientX: 80 });
  expect(onSeekEnd).toHaveBeenCalledTimes(1);
});
