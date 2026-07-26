/**
 * Farm layout persistence.
 *
 * The layout used to live in `localStorage`, which was fine while it was purely
 * decorative. Now that mount tiers grant a power bonus, the layout decides
 * income — so it has to be stored and validated server-side. A player editing
 * browser storage can no longer manufacture watts.
 *
 * Uses the shared API client, so token refresh and session expiry are handled
 * the same way as everywhere else in the app. Nothing here depends on React,
 * which is why the Phaser scene can call it directly.
 */

import { api, ApiError } from '../lib/apiClient.js';

/**
 * @typedef {object} LayoutMount
 * @property {string} type
 * @property {number} col anchor column
 * @property {number} row
 * @property {boolean[]} panels one flag per bay
 */

/**
 * Loads the stored layout along with the rules and the network baseline.
 *
 * @returns {Promise<{ mounts: LayoutMount[], powerRate: number, networkBaseline: number, config: object } | null>}
 *   null when the request failed, so the caller can start with an empty farm
 *   rather than a broken scene.
 */
export async function loadLayout() {
  try {
    const data = await api.get('/api/farm/layout');
    return {
      mounts: Array.isArray(data.mounts) ? data.mounts : [],
      powerRate: data.powerRate ?? 0,
      networkBaseline: data.networkBaseline ?? 0,
      config: data.config ?? null,
    };
  } catch (err) {
    // Session problems are already broadcast globally by the API client; here
    // we only need to report that the farm could not be read.
    console.error('[farm] could not load layout:', err instanceof ApiError ? err.message : err);
    return null;
  }
}

/**
 * Replaces the stored layout.
 *
 * A full replace rather than a patch: the scene already knows its complete
 * state, and replacing is idempotent, so a retried request cannot duplicate
 * anything.
 *
 * @param {LayoutMount[]} mounts
 * @returns {Promise<{ ok: true, powerRate: number, networkBaseline: number }
 *   | { ok: false, error: string, problems?: string[] }>}
 */
export async function saveLayout(mounts) {
  try {
    const data = await api.put('/api/farm/layout', { mounts });
    return {
      ok: true,
      powerRate: data.powerRate ?? 0,
      networkBaseline: data.networkBaseline ?? 0,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        ok: false,
        error: err.message,
        // The server explains exactly which mount broke which rule; surfacing
        // that beats a generic failure when the client and server disagree.
        problems: err.payload?.problems,
      };
    }
    return { ok: false, error: 'Could not reach the server.' };
  }
}

export default { loadLayout, saveLayout };
