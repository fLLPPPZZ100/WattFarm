import { create } from 'zustand';

/**
 * The notification queue.
 *
 * A zustand store rather than React context, for the same reason
 * `placementStore` is one: the queue has to be writable from outside the React
 * tree. The Phaser scene, `apiClient` and the other stores are plain modules
 * with no access to a provider, and wrapping them in one would mean threading a
 * hook through code that has no component to hang it on.
 *
 * The store owns *what* is queued. Timing lives in the component — see
 * `NotificationStack` — because the countdown is driven by the progress bar's
 * own animation, which pauses on hover for free. Keeping a timer here would
 * mean re-rendering every subscriber to move a bar.
 */

/** Notifications visible at once. Beyond this the oldest is evicted. */
export const MAX_VISIBLE = 5;

/** How long a notification stays up when the caller does not say. */
export const DEFAULT_DURATION = 4000;

const TYPES = new Set(['success', 'error', 'warning', 'info']);

/**
 * Ids come from a counter rather than `Date.now()` or `Math.random()`: two
 * notifications pushed in the same millisecond must not collide, since the id is
 * the React key and a duplicate would drop one of the cards.
 */
let sequence = 0;

function nextId() {
  sequence += 1;
  return `notification-${sequence}`;
}

/** Pristine state, reused for the initial store and for the reset on logout. */
const initialState = { items: [] };

export const useNotificationStore = create((set) => ({
  ...initialState,

  /**
   * Queues a notification and returns its id, so a caller can dismiss it early.
   *
   * @param {object} notification
   * @param {'success'|'error'|'warning'|'info'} [notification.type]
   * @param {string} notification.title
   * @param {string} [notification.description]
   * @param {number} [notification.duration] milliseconds on screen
   */
  push: ({ type = 'info', title, description = '', duration = DEFAULT_DURATION } = {}) => {
    const id = nextId();

    set((state) => {
      /**
       * Items already animating out do not count towards the cap: they are on
       * their way off screen, and counting them would evict a card the player
       * has not read yet to make room for one that is already leaving.
       */
      const live = state.items.filter((item) => !item.leaving);

      const items =
        live.length >= MAX_VISIBLE
          ? state.items.filter((item) => item !== live[0])
          : state.items;

      return {
        items: [
          ...items,
          {
            id,
            type: TYPES.has(type) ? type : 'info',
            title: String(title ?? ''),
            description: description ? String(description) : '',
            duration:
              Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION,
            leaving: false,
          },
        ],
      };
    });

    return id;
  },

  /**
   * Starts the exit animation. The card is removed from the store only once the
   * animation reports it has finished, otherwise it would vanish instantly and
   * the slide-out would never be seen.
   */
  dismiss: (id) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, leaving: true } : item)),
    })),

  /** Drops a card from the queue. Called when its exit animation ends. */
  remove: (id) =>
    set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

  clear: () => set({ items: [] }),
}));

/**
 * Clears the queue.
 *
 * Called on logout alongside the other store resets: a message about the
 * previous player's purchase has no business being on screen for whoever signs
 * in next on the same browser.
 */
export function resetNotificationStore() {
  useNotificationStore.setState({ ...initialState });
}
