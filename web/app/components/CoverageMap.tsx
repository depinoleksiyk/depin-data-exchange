'use client';

import { useEffect, useRef, useState } from 'react';

type Highlight = {
  x: number;
  y: number;
  label: string;
  tone?: 'forest' | 'clay' | 'sunflower';
};

const TONE_FILL: Record<NonNullable<Highlight['tone']>, string> = {
  forest: '#2d5a27',
  clay: '#b4552c',
  sunflower: '#c79215',
};

export function CoverageMap({ highlights }: { highlights: Highlight[] }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
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
      { threshold: 0.3 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative panel overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-dots opacity-50 transition-opacity duration-1000"
        style={{ opacity: visible ? 0.55 : 0 }}
      />

      {/* ambient drift */}
      <div
        aria-hidden
        className="absolute -inset-20 opacity-60"
        style={{
          background:
            'radial-gradient(600px 260px at 40% 30%, rgba(45, 90, 39, 0.22), transparent 70%)',
        }}
      />

      <svg
        viewBox="0 0 1000 500"
        className="relative w-full h-[280px]"
        role="img"
        aria-label="DePIN node coverage illustration"
      >
        <defs>
          <radialGradient id="coverage-glow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#2d5a27" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2d5a27" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* latitude bands — draw in */}
        {[0.2, 0.35, 0.5, 0.65, 0.8].map((frac, idx) => (
          <path
            key={idx}
            d={`M0 ${500 * frac} Q 500 ${500 * frac + 20 * Math.sin(idx)} 1000 ${500 * frac}`}
            stroke="#ddd1b6"
            strokeWidth={0.8}
            fill="none"
            opacity={visible ? 0.7 : 0}
            style={{
              strokeDasharray: 1400,
              strokeDashoffset: visible ? 0 : 1400,
              transition: `stroke-dashoffset 1500ms cubic-bezier(0.16, 1, 0.3, 1) ${200 + idx * 60}ms, opacity 500ms ease ${150 + idx * 60}ms`,
            }}
          />
        ))}

        {/* longitude ribs */}
        {[0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map((frac, idx) => (
          <path
            key={`lng-${idx}`}
            d={`M${1000 * frac} 40 Q ${1000 * frac + 30 * Math.sin(idx + 1)} 250 ${1000 * frac} 460`}
            stroke="#ddd1b6"
            strokeWidth={0.8}
            fill="none"
            opacity={visible ? 0.55 : 0}
            style={{
              strokeDasharray: 900,
              strokeDashoffset: visible ? 0 : 900,
              transition: `stroke-dashoffset 1400ms cubic-bezier(0.16, 1, 0.3, 1) ${400 + idx * 50}ms, opacity 500ms ease ${350 + idx * 50}ms`,
            }}
          />
        ))}

        <circle
          cx="500"
          cy="250"
          r="240"
          fill="url(#coverage-glow)"
          style={{
            opacity: visible ? 1 : 0,
            transition: 'opacity 1200ms ease 900ms',
          }}
        />

        {highlights.map((h, i) => {
          const fill = TONE_FILL[h.tone || 'forest'];
          const delay = 900 + i * 180;
          return (
            <g
              key={i}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(-8px)',
                transition: `opacity 400ms ease ${delay}ms, transform 520ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
              }}
            >
              <circle
                cx={h.x}
                cy={h.y}
                r={12}
                fill={fill}
                opacity={0.18}
                className="pin-halo"
                style={{ animationDelay: `${delay + 200}ms` }}
              />
              <circle cx={h.x} cy={h.y} r={4.5} fill={fill} />
              <circle cx={h.x} cy={h.y} r={1.8} fill="#faf5ea" />
              <text
                x={h.x + 14}
                y={h.y + 4}
                fontSize="11"
                fontFamily="Sora, sans-serif"
                fill="#1c1816"
                opacity={0.88}
              >
                {h.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* scan sweep */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 600ms ease 1800ms' }}
      >
        <div
          className="absolute top-0 bottom-0 w-[160px] -translate-x-full"
          style={{
            background: 'linear-gradient(to right, transparent, rgba(45, 90, 39, 0.08), transparent)',
            animation: 'tickerScroll 6s linear infinite',
            animationDelay: '1.8s',
          }}
        />
      </div>
    </div>
  );
}
