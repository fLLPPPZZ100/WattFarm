/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-abyss': '#0B1622',
        'bg-panel': '#131F2E',
        'line-dusk': '#2A3B4D',
        'accent-watt': '#F2B84B',
        'accent-current': '#5FD4C4',
        'text-primary': '#E8EDF2',
        'text-muted': '#7C8CA0',
      },
      fontFamily: {
        display: ['Silkscreen', 'cursive'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-5px)' },
          '40%': { transform: 'translateX(5px)' },
          '60%': { transform: 'translateX(-3px)' },
          '80%': { transform: 'translateX(3px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.7' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out both',
        'pop-in': 'pop-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        shake: 'shake 340ms ease-in-out both',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        float: 'float 3.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};