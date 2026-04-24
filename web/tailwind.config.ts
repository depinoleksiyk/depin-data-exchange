import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sora', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        cream: '#faf5ea',
        parchment: '#f3ecdc',
        ink: {
          DEFAULT: '#1c1816',
          muted: '#5b5247',
          soft: '#8a7e6d',
          faint: '#b7ab91',
        },
        earth: {
          50: '#f8f3e7',
          100: '#eee6d2',
          200: '#ddd1b6',
          300: '#bdad8b',
          400: '#8b7b5d',
          500: '#5f5339',
        },
        forest: {
          DEFAULT: '#2d5a27',
          dark: '#22451e',
          light: '#4a8a42',
          soft: '#e8efe4',
        },
        clay: {
          DEFAULT: '#b4552c',
          soft: '#f4e4d8',
        },
        sunflower: {
          DEFAULT: '#c79215',
          soft: '#f7ebcd',
        },
        danger: '#b3352c',
      },
      boxShadow: {
        card: '0 1px 2px rgba(28, 24, 22, 0.04), 0 4px 12px rgba(28, 24, 22, 0.04)',
        lift: '0 14px 30px -12px rgba(45, 90, 39, 0.22), 0 2px 4px rgba(28, 24, 22, 0.04)',
        glow: '0 0 0 3px rgba(45, 90, 39, 0.18)',
      },
      letterSpacing: {
        ultra: '-0.03em',
      },
      backgroundImage: {
        grid: 'radial-gradient(circle at 1px 1px, rgba(28, 24, 22, 0.06) 1px, transparent 0)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translate3d(0, 14px, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        drift: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '50%': { transform: 'translate3d(0, -6px, 0)' },
        },
        pulse2: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.7' },
          '50%': { transform: 'scale(1.25)', opacity: '0' },
        },
        drawLine: {
          '0%': { strokeDashoffset: '600' },
          '100%': { strokeDashoffset: '0' },
        },
        blobShift: {
          '0%, 100%': { transform: 'translate3d(-4%, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(4%, -4%, 0) scale(1.08)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-120% 0' },
          '100%': { backgroundPosition: '220% 0' },
        },
        tickerScroll: {
          '0%': { transform: 'translate3d(0, 0, 0)' },
          '100%': { transform: 'translate3d(-50%, 0, 0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translate3d(24px, 0, 0)' },
          '60%': { opacity: '1', transform: 'translate3d(-6px, 0, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 680ms cubic-bezier(0.16, 1, 0.3, 1) both',
        fadeIn: 'fadeIn 520ms ease-out both',
        drift: 'drift 6s ease-in-out infinite',
        pulse2: 'pulse2 2.6s ease-out infinite',
        drawLine: 'drawLine 1.4s ease-out both',
        blobShift: 'blobShift 18s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        tickerScroll: 'tickerScroll 38s linear infinite',
        slideInRight: 'slideInRight 480ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both',
      },
    },
  },
  plugins: [],
};

export default config;
