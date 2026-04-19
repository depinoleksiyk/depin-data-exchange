'use client';

import { useEffect, useRef, useState } from 'react';
import { useCountUp } from '../lib/motion';

export function CountUp({
  value,
  decimals = 0,
  duration = 1400,
  prefix = '',
  suffix = '',
  className = '',
}: {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shouldStart, setShouldStart] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setShouldStart(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldStart(true);
            obs.disconnect();
            return;
          }
        }
      },
      { threshold: 0.35 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  const display = useCountUp(value, duration, shouldStart, decimals);
  const formatted = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString();

  return (
    <span ref={ref} className={`tabular ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
