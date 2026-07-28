/**
 * The notification stack.
 *
 * Renders whatever `notificationStore` holds, top-left and stacked downwards.
 * Nothing calls this directly — push messages with `lib/notify.js` and they
 * appear here.
 *
 * Timing note. The countdown is not a `setTimeout`: the progress bar's own
 * animation is the clock, and the card is dismissed when that animation ends.
 * That buys three things a timer would have to reimplement:
 *
 *   - hover pause for free (`animation-play-state: paused`), with no remaining
 *     time to track and no risk of the bar and the timer disagreeing
 *   - a bar that is always exactly in sync with the real deadline
 *   - zero re-renders while a notification is on screen
 */

import { useEffect, useRef, useState } from 'react';

import { useNotificationStore } from '../../store/notificationStore.js';
import { AlertIcon, CheckIcon, CloseIcon, CrossIcon, InfoIcon } from './pixel.jsx';

/**
 * Per-type presentation.
 *
 * Each type carries its own glyph as well as its own colour: errors and
 * warnings sit in the same stack, and distinguishing them by hue alone fails
 * for anyone with a red/green deficiency.
 *
 * Colours are the existing theme accents rather than new ones — watt yellow is
 * already the interface's "attention" colour and current cyan its "good"
 * colour, so a warning and a success read correctly without being taught.
 */
const VARIANTS = {
  success: {
    Icon: CheckIcon,
    border: 'border-accent-current',
    accent: 'text-accent-current',
    badge: 'bg-accent-current/15',
    bar: 'bg-accent-current',
  },
  error: {
    Icon: CrossIcon,
    border: 'border-danger-crt',
    accent: 'text-danger-crt',
    badge: 'bg-danger-crt/15',
    bar: 'bg-danger-crt',
  },
  warning: {
    Icon: AlertIcon,
    border: 'border-accent-watt',
    accent: 'text-accent-watt',
    badge: 'bg-accent-watt/15',
    bar: 'bg-accent-watt',
  },
  info: {
    Icon: InfoIcon,
    border: 'border-bevel-light',
    accent: 'text-text-primary',
    badge: 'bg-bevel-light/30',
    bar: 'bg-bevel-light',
  },
};

/** Milliseconds allowed for the exit animation before removal is forced. */
const EXIT_FALLBACK_MS = 400;

function NotificationCard({ item, onDismiss, onRemoved }) {
  const variant = VARIANTS[item.type] || VARIANTS.info;
  const { Icon } = variant;

  const cardRef = useRef(null);
  const barRef = useRef(null);
  const [paused, setPaused] = useState(false);

  /**
   * Safety net. Removal is normally driven by the exit animation ending; if that
   * event never arrives — a `display: none` ancestor suppresses animations
   * entirely — the card would keep a slot in the stack forever.
   */
  useEffect(() => {
    if (!item.leaving) return undefined;
    const timer = setTimeout(() => onRemoved(item.id), EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [item.leaving, item.id, onRemoved]);

  /**
   * One handler for all three animations on this card. They are told apart by
   * event target rather than by `event.animationName`, which would couple this
   * component to the keyframe names Tailwind happens to generate.
   */
  function handleAnimationEnd(event) {
    if (event.target === barRef.current) {
      // The bar reaching zero *is* the timeout expiring.
      onDismiss(item.id);
      return;
    }
    if (event.target === cardRef.current && item.leaving) {
      onRemoved(item.id);
    }
  }

  return (
    <div
      ref={cardRef}
      // Errors interrupt; everything else is announced politely.
      role={item.type === 'error' ? 'alert' : 'status'}
      onAnimationEnd={handleAnimationEnd}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // focus/blur bubble in React, so tabbing to the close button also pauses —
      // a keyboard user needs the same reading time a hovering one gets.
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={[
        'pointer-events-auto relative w-full border-2 bg-bg-panel shadow-pixel',
        variant.border,
        item.leaving ? 'animate-toast-out' : 'animate-toast-in',
      ].join(' ')}
      style={{ borderRadius: 0 }}
    >
      <div className="flex items-start gap-2.5 p-3 pb-3.5 pr-8">
        <span
          className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center ${variant.badge} ${variant.accent}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={`font-display text-[10px] uppercase leading-tight tracking-widest ${variant.accent}`}
          >
            {item.title}
          </p>
          {item.description && (
            <p className="mt-1.5 break-words text-[11px] leading-snug text-text-muted">
              {item.description}
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="pixel-focus absolute right-1 top-1 flex h-6 w-6 items-center justify-center
                   text-text-muted transition-none hover:text-text-primary"
      >
        <CloseIcon />
      </button>

      {/*
        Time remaining, and the dismissal clock.
      
        The duration goes through `--toast-duration` rather than straight into
        `animation-duration` because the reduced-motion rule in index.css has to
        be able to restore it with `!important`, which would otherwise beat an
        inline value and collapse the countdown to nothing.
      
        Pausing this pauses the dismissal, since they are the same mechanism. It
        stays paused while leaving so a card on its way out cannot fire a second
        dismissal.
      */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-bg-abyss">
        <span
          ref={barRef}
          className={`block h-full origin-left animate-toast-drain ${variant.bar}`}
          style={{
            '--toast-duration': `${item.duration}ms`,
            animationDuration: 'var(--toast-duration)',
            animationPlayState: paused || item.leaving ? 'paused' : 'running',
          }}
        />
      </div>
    </div>
  );
}

/**
 * Mounted once, by `AppShell`, inside the content area — which is why it can be
 * positioned with plain `absolute left-4 top-4` and land exactly below the
 * header and beside the sidebar without repeating either of their measurements.
 *
 * The container ignores pointer events so it never steals a click from the farm
 * canvas underneath; each card re-enables them for itself.
 */
export default function NotificationStack() {
  const items = useNotificationStore((state) => state.items);
  const dismiss = useNotificationStore((state) => state.dismiss);
  const remove = useNotificationStore((state) => state.remove);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-50 flex w-[320px] flex-col gap-2">
      {items.map((item) => (
        <NotificationCard key={item.id} item={item} onDismiss={dismiss} onRemoved={remove} />
      ))}
    </div>
  );
}
