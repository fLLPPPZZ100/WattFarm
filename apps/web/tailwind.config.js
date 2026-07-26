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

        // Extra steps for the pixel UI: hard highlights and shadows used to
        // fake bevelled 8-bit edges without images.
        'bevel-light': '#3D5570',
        'bevel-dark': '#060D15',
        'accent-watt-dim': '#8A6A2B',
        'danger-crt': '#FF5C5C',
      },
      fontFamily: {
        display: ['Silkscreen', 'cursive'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        // Hard-edged shadows only — no blur, so everything stays crisp at
        // pixel scale. Mimics NES/GBA style bevels.
        pixel: '4px 4px 0 0 #060D15',
        'pixel-sm': '2px 2px 0 0 #060D15',
        'pixel-lg': '6px 6px 0 0 #060D15',
        'pixel-inset': 'inset 2px 2px 0 0 rgba(0,0,0,0.45)',
        'glow-watt': '0 0 0 2px rgba(242,184,75,0.35), 0 0 18px rgba(242,184,75,0.28)',
        'glow-current': '0 0 0 2px rgba(95,212,196,0.35), 0 0 18px rgba(95,212,196,0.25)',
        'glow-danger': '0 0 0 2px rgba(255,92,92,0.35), 0 0 18px rgba(255,92,92,0.25)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // Stepped entrance so the panel "snaps" in like a retro UI rather
        // than easing smoothly.
        'pixel-in': {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-4px)' },
          '40%': { transform: 'translateX(4px)' },
          '60%': { transform: 'translateX(-2px)' },
          '80%': { transform: 'translateX(2px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.65' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        // Slow vertical drift of the scanline overlay — CRT feel.
        scanlines: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 100%' },
        },
        // Blinking terminal caret for the section headers.
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        // Sun/energy pip travelling across the loading bar.
        'bar-sweep': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        // Twinkling stars in the login backdrop.
        twinkle: {
          '0%, 100%': { opacity: '0.15' },
          '50%': { opacity: '0.8' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out both',
        'pixel-in': 'pixel-in 220ms steps(4, end) both',
        shake: 'shake 320ms steps(5, end) both',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        float: 'float 3.5s steps(4, end) infinite',
        scanlines: 'scanlines 8s linear infinite',
        blink: 'blink 1.1s steps(1, end) infinite',
        'bar-sweep': 'bar-sweep 1.1s steps(8, end) infinite',
        twinkle: 'twinkle 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
