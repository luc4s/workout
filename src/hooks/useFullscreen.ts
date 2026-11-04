import { useEffect, useState } from 'react';

/** Full screen for the session screens (Fullscreen API). Entering needs a tap: browsers refuse it otherwise. */
export function fullscreenSupported(): boolean {
  return typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
}

export function enterFullscreen(): void {
  if (!fullscreenSupported() || document.fullscreenElement) return;
  // Hide the browser's navigation bar too where it allows (Chrome on Android).
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
}

export function exitFullscreen(): void {
  if (typeof document !== 'undefined' && document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
}

export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const [active, setActive] = useState(typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return { supported: fullscreenSupported(), active, toggle: () => (document.fullscreenElement ? exitFullscreen() : enterFullscreen()) };
}
