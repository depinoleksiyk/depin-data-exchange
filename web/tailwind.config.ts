import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sora', 'system-ui', 'sans-serif'],
      },
      colors: {
        cream: '#f5f0e8',
        earth: { 100: '#f0ebe3', 200: '#e4ddd2', 300: '#c9bfb0', 400: '#a69882', 500: '#8a7a64' },
        forest: { DEFAULT: '#2d5a27', light: '#4a8a42' },
      },
    },
  },
  plugins: [],
};

export default config;
