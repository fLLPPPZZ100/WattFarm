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
      /**
       * Every family is a pixel typeface — the interface is 2D throughout, so a
       * smooth humanist sans in the middle of it read as a different product.
       *
       * display — Silkscreen. Chunky bitmap caps for titles and buttons.
       * body    — Pixelify Sans. The only pixel face here that stays legible in
       *           a paragraph, and it has a real weight axis (400..700), which
       *           Silkscreen and VT323 do not.
       * mono    — VT323. Genuinely monospaced, which is the whole reason this
       *           slot exists: live counters must not jump as digits change
       *           width. A proportional pixel font would reintroduce that
       *           shift.
       */
      fontFamily: {
        display: ['Silkscreen', 'monospace'],
        body: ['"Pixelify Sans"', 'sans-serif'],
        mono: ['VT323', 'monospace'],
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
        /* ── Notifications ────────────────────────────────────────────
           The stack sits against the left edge of the content area, so a
           notification enters and leaves along that edge rather than dropping
           in from above. The offset is small (16px) because the stack is only
           16px from the edge and a longer travel would be clipped by the
           content area's overflow. */
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'toast-out': {
          '0%': { opacity: '1', transform: 'translateX(0)' },
          '100%': { opacity: '0', transform: 'translateX(-16px)' },
        },
        /* Time remaining. `scaleX` rather than `width` so the browser can keep
           the bar on the compositor: five of these animating at once must not
           trigger layout. */
        'toast-drain': {
          '0%': { transform: 'scaleX(1)' },
          '100%': { transform: 'scaleX(0)' },
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
        /**
         * Stepped like the rest of the interface, but with enough steps
         * (~27ms each) that the slide still reads as smooth rather than
         * juddering — the notification is not a button press, so it should not
         * snap.
         */
        'toast-in': 'toast-in 220ms steps(8, end) both',
        'toast-out': 'toast-out 180ms steps(6, end) both',
        /**
         * The duration here is only the default. `NotificationStack` overrides
         * it per card with an inline `animation-duration: var(--toast-duration)`,
         * because each notification may specify its own lifetime.
         *
         * The variable is deliberately not written into this shorthand: Tailwind
         * parses the value to work out which keyframes to emit, and feeding it a
         * `var()` in the duration slot relies on that parser being lenient.
         */
        'toast-drain': 'toast-drain 4000ms steps(40, end) both',
      },
    },
  },
  plugins: [],
};
