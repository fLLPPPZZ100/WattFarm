/**
 * The notification API.
 *
 * Import this anywhere — a component, a zustand store, `apiClient`, a Phaser
 * scene — and call it:
 *
 *   notify.success('Purchase complete', 'You bought a Solar Panel.');
 *   notify.error('Insufficient VLT', 'You need 20 more VLT.');
 *   notify.warning('Storage full', 'Build more mounts to install panels.');
 *   notify.info('Production started', 'Your panels are generating power.');
 *
 * There is no hook and no provider on purpose: half the places that want to
 * report something are not components. `useNotificationStore.getState()` is
 * read at call time rather than captured at module scope, so this stays correct
 * across a store reset and cannot hold a stale reference.
 *
 * Every method takes an optional third argument for overrides, currently just
 * the duration:
 *
 *   notify.error('Save failed', 'Retrying...', { duration: 8000 });
 */

import { useNotificationStore } from '../store/notificationStore.js';

/** Builds the `notify.<type>(title, description, options)` signature. */
function forType(type) {
  return (title, description, options) =>
    useNotificationStore.getState().push({ ...options, type, title, description });
}

export const notify = {
  success: forType('success'),
  error: forType('error'),
  warning: forType('warning'),
  info: forType('info'),

  /** Escape hatch for a fully specified notification object. */
  show: (notification) => useNotificationStore.getState().push(notification),

  /** Dismisses one notification early, by the id `push` returned. */
  dismiss: (id) => useNotificationStore.getState().dismiss(id),

  /** Clears everything currently on screen. */
  clear: () => useNotificationStore.getState().clear(),
};

export default notify;
