import { useState, useEffect } from 'react';

export function useElapsedTimer(startTime: string | null): { elapsed: string; hours: number } {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  if (!startTime) return { elapsed: '00:00:00', hours: 0 };

  const ms = now - new Date(startTime).getTime();
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const elapsed = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return { elapsed, hours: h };
}
