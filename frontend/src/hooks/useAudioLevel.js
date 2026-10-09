import { useEffect } from 'react';

// While `active`, polls getLevels() every animation frame and writes the
// loudness of whoever is talking (the customer while listening, the agent
// while speaking) to the `--level` CSS variable on `ref`'s element, smoothed
// so the visuals glide rather than jitter. Writing a CSS variable instead of
// React state keeps this at 60fps without re-rendering anything.
export function useAudioLevel(ref, getLevels, source, active) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return undefined;
    let smoothed = 0;
    let frame;
    const tick = () => {
      const levels = getLevels();
      const target = source === 'user' ? levels.user : source === 'agent' ? levels.agent : 0;
      // Rise fast, fall slowly -- reads as "reacting to the voice".
      smoothed += (target - smoothed) * (target > smoothed ? 0.5 : 0.12);
      el.style.setProperty('--level', smoothed.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.style.setProperty('--level', '0');
    };
  }, [ref, getLevels, source, active]);
}
