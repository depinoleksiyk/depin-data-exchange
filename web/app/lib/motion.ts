'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Intersection-observer reveal. Attach `ref` to a container and spread the
 * returned attributes onto any element that should fade/slide into view.
 * Pair with the `[data-reveal]` CSS in globals.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -60px 0px', ...options }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return {
    ref,
    visible,
    reveal: { 'data-reveal': '', 'data-visible': visible ? 'true' : 'false' } as const,
  };
}

/**
 * Eases a numeric value from 0 → target. Call once the container is visible.
 * Works with integers or floats; set `decimals` to preserve decimal digits.
 */
export function useCountUp(target: number, duration = 1200, start = false, decimals = 0) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!start || startedRef.current) return;
    startedRef.current = true;

    if (typeof target !== 'number' || !Number.isFinite(target) || target === 0) {
      setValue(target || 0);
      return;
    }

    let startTs: number | null = null;
    const step = (ts: number) => {
      if (startTs === null) startTs = ts;
      const progress = Math.min(1, (ts - startTs) / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // cubic-out
      const current = target * eased;
      setValue(decimals > 0 ? Number(current.toFixed(decimals)) : Math.round(current));
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, start, decimals]);

  return value;
}

/** Small helper for staggered children — maps index to a style object */
export function stagger(index: number, base = 80, initial = 40): React.CSSProperties {
  return { animationDelay: `${initial + index * base}ms` };
}
