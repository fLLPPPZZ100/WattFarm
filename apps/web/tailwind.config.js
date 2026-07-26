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
    },
  },
  plugins: [],
};