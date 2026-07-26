/**
 * Pixel-art UI primitives.
 *
 * The project previously had no shared components, so every screen repeated
 * its own Tailwind strings. These cover the auth surfaces and are deliberately
 * small and unopinionated so other pages can adopt them incrementally.
 *
 * Design rules enforced here:
 *   - no border-radius (rounded corners break the 8-bit read)
 *   - 2px hard borders with bevelled light/dark edges
 *   - hard offset shadows, never blurred
 *   - stepped transitions so motion feels digital rather than springy
 */

import { forwardRef, useId, useState } from 'react';

/* ── Icons ───────────────────────────────────────────────────────────
   Drawn on a 12x12 grid with square caps so strokes land on whole pixels. */

function PixelIcon({ children, className = 'w-4 h-4' }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const MailIcon = (props) => (
  <PixelIcon {...props}>
    <rect x="1" y="2.5" width="10" height="7" />
    <path d="M1 3.5l5 3 5-3" />
  </PixelIcon>
);

export const LockIcon = (props) => (
  <PixelIcon {...props}>
    <rect x="2" y="5.5" width="8" height="5" />
    <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" />
  </PixelIcon>
);

export const UserIcon = (props) => (
  <PixelIcon {...props}>
    <circle cx="6" cy="4" r="2" />
    <path d="M2 10.5c0-2 1.8-3 4-3s4 1 4 3" />
  </PixelIcon>
);

export const EyeIcon = ({ off, ...props }) => (
  <PixelIcon {...props}>
    {off ? (
      <>
        <path d="M1.5 6S3.5 3 6 3s4.5 3 4.5 3-2 3-4.5 3S1.5 6 1.5 6z" />
        <path d="M2 2l8 8" />
      </>
    ) : (
      <>
        <path d="M1.5 6S3.5 3 6 3s4.5 3 4.5 3-2 3-4.5 3S1.5 6 1.5 6z" />
        <circle cx="6" cy="6" r="1.5" />
      </>
    )}
  </PixelIcon>
);

export const AlertIcon = (props) => (
  <PixelIcon {...props}>
    <path d="M6 1.5L11 10.5H1L6 1.5z" />
    <path d="M6 5v2.5M6 9h.01" />
  </PixelIcon>
);

export const CheckIcon = (props) => (
  <PixelIcon {...props}>
    <path d="M2 6.5l2.5 2.5L10 3.5" />
  </PixelIcon>
);

export const ArrowLeftIcon = (props) => (
  <PixelIcon {...props}>
    <path d="M10 6H2M5 3L2 6l3 3" />
  </PixelIcon>
);

export const GoogleIcon = ({ className = 'w-4 h-4' }) => (
  // Kept as the official multi-colour mark: Google brand guidelines require
  // the unmodified logo, so this one is not pixel-styled.
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

/* ── Spinner ─────────────────────────────────────────────────────────
   A rotating dot ring would look wrong here, so this is a 4-block chase
   rendered with stepped opacity. */

export function PixelSpinner({ className = '' }) {
  return (
    <span
      className={`inline-flex gap-0.5 ${className}`}
      role="status"
      aria-label="Carregando"
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-1 h-3 bg-current animate-glow-pulse"
          style={{ animationDelay: `${i * 120}ms`, animationDuration: '900ms' }}
        />
      ))}
    </span>
  );
}

/* ── Panel ───────────────────────────────────────────────────────── */

/**
 * Bevelled container with an accent top bar and optional CRT scanlines.
 */
export function PixelPanel({ children, className = '', scanlines = false, accent = true }) {
  return (
    <div className={`pixel-panel ${className}`}>
      {accent && <div className="h-1 bg-accent-watt" />}
      {children}
      {scanlines && <div className="crt-overlay animate-scanlines" aria-hidden="true" />}
    </div>
  );
}

/* ── Section heading ─────────────────────────────────────────────── */

/**
 * Terminal-style heading with a blinking caret, used to label form sections.
 */
export function PixelHeading({ children, as: Tag = 'h2', className = '', id }) {
  return (
    <Tag
      id={id}
      className={`font-display text-[13px] uppercase tracking-widest text-accent-watt ${className}`}
    >
      {children}
      <span className="ml-1 inline-block w-2 h-3 -mb-0.5 bg-accent-watt animate-blink" aria-hidden="true" />
    </Tag>
  );
}

/* ── Text field ──────────────────────────────────────────────────── */

/**
 * Labelled input with a leading icon and inline validation message.
 *
 * `error` renders as the accessible description via aria-describedby and flips
 * aria-invalid, so screen readers announce the problem rather than relying on
 * the red border alone.
 */
export const PixelField = forwardRef(function PixelField(
  {
    label,
    icon: Icon,
    error,
    hint,
    type = 'text',
    revealable = false,
    className = '',
    id: providedId,
    ...inputProps
  },
  ref
) {
  const autoId = useId();
  const id = providedId || `field-${autoId}`;
  const messageId = `${id}-message`;
  const [revealed, setRevealed] = useState(false);

  const resolvedType = revealable ? (revealed ? 'text' : 'password') : type;

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block font-display text-[9px] uppercase tracking-widest text-text-muted"
      >
        {label}
      </label>

      <div className="relative">
        {Icon && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
            <Icon />
          </span>
        )}

        <input
          ref={ref}
          id={id}
          type={resolvedType}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={[
            'pixel-input',
            Icon ? 'pl-9' : '',
            revealable ? 'pr-11' : '',
          ].join(' ')}
          {...inputProps}
        />

        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Ocultar senha' : 'Mostrar senha'}
            className="pixel-focus absolute right-1.5 top-1/2 flex h-7 w-8 -translate-y-1/2 items-center
                       justify-center text-text-muted transition-none hover:text-accent-watt"
          >
            <EyeIcon off={revealed} />
          </button>
        )}
      </div>

      {(error || hint) && (
        <p
          id={messageId}
          className={`mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug ${
            error ? 'text-danger-crt' : 'text-text-muted'
          }`}
        >
          {error && <AlertIcon className="mt-px h-3 w-3 shrink-0" />}
          <span>{error || hint}</span>
        </p>
      )}
    </div>
  );
});

/* ── Buttons ─────────────────────────────────────────────────────── */

export function PixelButton({
  children,
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  ...rest
}) {
  const variantClass = variant === 'primary' ? 'pixel-btn-primary' : 'pixel-btn-ghost';

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${variantClass} pixel-focus ${className}`}
      {...rest}
    >
      {loading && <PixelSpinner />}
      {children}
    </button>
  );
}

/* ── Alert banner ────────────────────────────────────────────────── */

/**
 * @param {'error'|'success'|'info'} tone
 * @param {number} [shakeKey] change this to re-trigger the shake animation on
 *   a repeated error; without it an identical message would sit still.
 */
export function PixelAlert({ tone = 'error', children, shakeKey, className = '' }) {
  const tones = {
    error: 'border-danger-crt bg-danger-crt/10 text-danger-crt',
    success: 'border-accent-current bg-accent-current/10 text-accent-current',
    info: 'border-line-dusk bg-bg-abyss text-text-muted',
  };

  const Icon = tone === 'success' ? CheckIcon : AlertIcon;

  return (
    <div
      key={shakeKey}
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 border-2 px-3 py-2.5 text-[11px] leading-relaxed
                  ${tones[tone]} ${tone === 'error' ? 'animate-shake' : ''} ${className}`}
      style={{ borderRadius: 0 }}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{children}</span>
    </div>
  );
}

/* ── Password strength meter ─────────────────────────────────────── */

/**
 * Segmented meter driven by `scorePassword`. Purely advisory — the hard
 * minimum is enforced on submit, not here.
 */
export function PixelStrengthMeter({ score, label, hint }) {
  const colours = [
    'transparent',
    'bg-danger-crt',
    'bg-danger-crt',
    'bg-accent-watt',
    'bg-accent-current',
  ];

  const textColour =
    score >= 4 ? 'text-accent-current' : score === 3 ? 'text-accent-watt' : 'text-danger-crt';

  return (
    <div className="mt-2" aria-live="polite">
      <div className="pixel-meter">
        {[1, 2, 3, 4].map((seg) => (
          <span
            key={seg}
            className={`pixel-meter-seg ${seg <= score ? colours[score] : ''}`}
          />
        ))}
      </div>
      {label && (
        <p className={`mt-1.5 font-display text-[9px] uppercase tracking-widest ${textColour}`}>
          {label}
          {hint && <span className="ml-2 normal-case tracking-normal text-text-muted">{hint}</span>}
        </p>
      )}
    </div>
  );
}

/* ── Divider ─────────────────────────────────────────────────────── */

export function PixelDivider({ children }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-0.5 flex-1 bg-line-dusk" />
      {children && (
        <span className="font-display text-[9px] uppercase tracking-widest text-text-muted">
          {children}
        </span>
      )}
      <span className="h-0.5 flex-1 bg-line-dusk" />
    </div>
  );
}

/* ── Segmented tabs ──────────────────────────────────────────────── */

/**
 * Two-state selector used for the login / register switch.
 *
 * Implemented with real buttons and `aria-pressed` rather than radio inputs,
 * because the control swaps the whole form rather than submitting a value.
 */
export function PixelTabs({ options, value, onChange }) {
  return (
    <div className="pixel-panel-inset mb-5 flex gap-1 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`pixel-focus flex-1 border-2 py-2 font-display text-[10px] uppercase
                        tracking-widest transition-none ${
                          active
                            ? 'border-accent-watt bg-accent-watt/15 text-accent-watt'
                            : 'border-transparent text-text-muted hover:bg-bg-panel hover:text-text-primary'
                        }`}
            style={{ borderRadius: 0 }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
