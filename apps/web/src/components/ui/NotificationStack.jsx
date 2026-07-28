/**
 * The notification stack.
 *
 * Renders whatever `notificationStore` holds, pinned to the top-left of the
 * viewport and stacked downwards. Nothing calls this directly — push messages
 * with `lib/notify.js` and they appear here.
 *
 * Two things worth knowing:
 *
 *   - It renders through a portal into `document.body`, so it is positioned
 *     against the screen rather than against whatever container mounts it. That
 *     is what lets it sit in the true top-left corner, above the sidebar and
 *     header, instead of being trapped inside the content area.
 *
 *   - Auto-dismiss is a real timer, not the progress bar's `animationend`. The
 *     bar is a visual only. An earlier version keyed dismissal off the bar's
 *     animation ending, which silently failed whenever that event did not fire,
 *     leaving notifications on screen forever. A timer that tracks its own
 *     remaining time is dull but cannot get stuck.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  const [paused, setPaused] = useState(false);

  /**
   * Time left before this card dismisses itself, in milliseconds.
   *
   * A ref rather than state: it is written on every pause and never needs to
   * trigger a render on its own — the bar's countdown is CSS, and the card only
   * re-renders when it actually leaves.
   */
  const remainingRef = useRef(item.duration);

  /**
   * The auto-dismiss timer.
   *
   * Runs while the card is neither paused nor already leaving. On cleanup —
   * which fires on pause, on unmount, and the moment `leaving` flips — it clears
   * the pending timeout and banks however long this run was actually on screen,
   * so resuming continues from where it stopped instead of restarting.
   */
  useEffect(() => {
    if (item.leaving || paused) return undefined;

    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(item.id), remainingRef.current);

    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [paused, item.leaving, item.id, onDismiss]);

  /**
   * Removes the card once it has finished animating out. The `animationend`
   * below normally does this; the timer is the safety net for when that event
   * never arrives (a `display: none` ancestor suppresses animations entirely),
   * which would otherwise keep a dead slot in the stack.
   */
  useEffect(() => {
    if (!item.leaving) return undefined;
    const timer = setTimeout(() => onRemoved(item.id), EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [item.leaving, item.id, onRemoved]);

  function handleAnimationEnd(event) {
    // Only the card's own exit animation removes it — not the bar's, and not
    // the entrance. Matching on the target keeps this decoupled from the
    // keyframe names Tailwind generates.
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
        Time-remaining bar. Purely a visual now that a timer owns dismissal, but
        it shares the same duration and pauses on the same signal, so it tracks
        the real countdown closely. Paused while leaving so it does not keep
        draining as the card slides away.
      */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-bg-abyss">
        <span
          className={`block h-full origin-left animate-toast-drain ${variant.bar}`}
          style={{
            '--toast-duration': `${item.duration}ms`,
            animationDuration: `${item.duration}ms`,
            animationPlayState: paused || item.leaving ? 'paused' : 'running',
          }}
        />
      </div>
    </div>
  );
}

/**
 * Mounted once by `AppShell`. Rendered into `document.body` so it is positioned
 * against the viewport — the fixed top-left corner of the screen — rather than
 * against the content area it is written inside.
 *
 * The container ignores pointer events so it never steals a click from anything
 * beneath it; each card re-enables them for itself.
 */
export default function NotificationStack() {
  const items = useNotificationStore((state) => state.items);
  const dismiss = useNotificationStore((state) => state.dismiss);
  const remove = useNotificationStore((state) => state.remove);

  // No document during SSR; harmless in this client-only app but cheap to guard.
  if (typeof document === 'undefined' || items.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed left-4 top-4 z-[60] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((item) => (
        <NotificationCard key={item.id} item={item} onDismiss={dismiss} onRemoved={remove} />
      ))}
    </div>,
    document.body
  );
}
