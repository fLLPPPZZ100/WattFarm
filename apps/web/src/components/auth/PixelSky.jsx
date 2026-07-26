import { useMemo } from 'react';

/**
 * Decorative backdrop for the auth screens: a night sky over a pixel solar
 * farm silhouette.
 *
 * Everything is CSS and inline SVG rather than an image asset, so it scales to
 * any viewport without a second art pass and adds nothing to the bundle.
 * Marked aria-hidden throughout — it carries no information.
 */
export default function PixelSky() {
  /**
   * Star positions are randomised once per mount. Using a memo (not state)
   * keeps them stable across re-renders so they do not visibly jump while the
   * user types.
   */
  const stars = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        // Confined to the upper two thirds so stars never sit "inside" the hills.
        top: Math.random() * 62,
        size: Math.random() > 0.82 ? 2 : 1,
        delay: Math.random() * 3,
      })),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Vertical night gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, #060D15 0%, #0B1622 42%, #12212F 72%, #1A2B3A 100%)',
        }}
      />

      {/* Stars */}
      {stars.map((star) => (
        <span
          key={star.id}
          className="absolute animate-twinkle bg-text-primary"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}

      {/* Moon: two overlapping squares to keep the silhouette blocky */}
      <div className="absolute right-[12%] top-[10%]">
        <div
          className="h-10 w-10 bg-accent-watt/85"
          style={{ boxShadow: '0 0 32px 8px rgba(242,184,75,0.16)' }}
        />
        {/* Offset dark square carves a crescent without needing a mask */}
        <div className="absolute -right-3 -top-2 h-10 w-10 bg-[#0B1622]" />
      </div>

      {/*
        Rolling hills + solar array silhouette.
        preserveAspectRatio="none" lets the horizon stretch across ultrawide
        viewports while the panels keep their pixel proportions.
      */}
      <svg
        className="absolute bottom-0 left-0 w-full"
        viewBox="0 0 400 120"
        preserveAspectRatio="none"
        style={{ height: '38%', shapeRendering: 'crispEdges' }}
      >
        {/* Far hill */}
        <path d="M0 74 L60 62 L120 70 L190 56 L260 68 L330 58 L400 66 L400 120 L0 120 Z" fill="#16283A" />
        {/* Near hill */}
        <path d="M0 92 L70 84 L140 90 L210 80 L290 88 L360 82 L400 88 L400 120 L0 120 Z" fill="#0E1B27" />

        {/* Solar panel rows. Rendered as a repeating group so the horizon reads
            as an actual farm rather than abstract shapes. */}
        {[
          { x: 26, y: 68, s: 1 },
          { x: 96, y: 74, s: 0.85 },
          { x: 166, y: 64, s: 1.1 },
          { x: 244, y: 72, s: 0.9 },
          { x: 318, y: 66, s: 1 },
        ].map((panel) => (
          <g key={panel.x} transform={`translate(${panel.x} ${panel.y}) scale(${panel.s})`}>
            {/* Support post */}
            <rect x="9" y="10" width="2" height="10" fill="#0A1219" />
            {/* Tilted panel face */}
            <path d="M0 8 L18 2 L20 6 L2 12 Z" fill="#1E3A52" />
            {/* Specular edge catching the moonlight */}
            <path d="M0 8 L18 2 L18.6 3.2 L0.6 9.2 Z" fill="#F2B84B" opacity="0.5" />
          </g>
        ))}
      </svg>

      {/* Ground fog: lifts the panel row off the hills */}
      <div
        className="absolute bottom-0 left-0 h-24 w-full"
        style={{
          background: 'linear-gradient(to top, rgba(95,212,196,0.07), transparent)',
        }}
      />

      {/* Global scanlines tie the whole screen to the CRT theme */}
      <div className="crt-overlay animate-scanlines opacity-60" />
    </div>
  );
}
