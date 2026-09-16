import { useEffect, useState } from 'react';

type Status = 'active' | 'unsupported' | 'released' | 'error';

/** Keep the screen awake while mounted. Re-acquires the lock when the page becomes visible again. */
export function useWakeLock(enabled = true): Status {
  const [status, setStatus] = useState<Status>('released');

  useEffect(() => {
    if (!enabled) return;
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> } };
    if (!nav.wakeLock) {
      setStatus('unsupported');
      return;
    }
    let sentinel: WakeLockSentinel | undefined;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      try {
        sentinel = await nav.wakeLock!.request('screen');
        setStatus('active');
        sentinel.addEventListener('release', () => !cancelled && setStatus('released'));
      } catch {
        setStatus('error');
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [enabled]);

  return status;
}
