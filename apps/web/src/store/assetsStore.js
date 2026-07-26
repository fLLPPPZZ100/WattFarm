import { create } from 'zustand';
import { api } from '../lib/apiClient.js';

/** Pristine state, reused for the initial store and for the reset on logout. */
const initialState = {
  catalog: [],
  totalW: 0,
  vltBalance: 0,
  assets: [],
  loading: false,
  error: null,
};

export const useAssetsStore = create((set, get) => ({
  ...initialState,

  fetchCatalog: async () => {
    try {
      const data = await api.get('/api/assets/catalog');
      set({ catalog: data.catalog, error: null });
    } catch (err) {
      // The shared client already handles session expiry globally, so here we
      // only surface the message for display.
      set({ error: err.message });
    }
  },

  fetchMining: async () => {
    try {
      const data = await api.get('/api/assets/mine');
      set({
        assets: data.assets,
        totalW: data.totalW,
        vltBalance: data.vltBalance,
        error: null,
      });
    } catch (err) {
      set({ error: err.message });
    }
  },

  buyAsset: async (type, quantity) => {
    set({ loading: true, error: null });
    try {
      const data = await api.post('/api/assets/buy', { type, quantity: quantity || 1 });
      await Promise.all([get().fetchCatalog(), get().fetchMining()]);
      set({ loading: false });
      return data;
    } catch (err) {
      set({ loading: false, error: err.message });
      throw err;
    }
  },
}));

/**
 * Wipes cached game data.
 *
 * Called on logout: zustand stores are module-level singletons that outlive the
 * session, so without this the next account to sign in on the same browser
 * briefly rendered the previous player's balance and inventory.
 */
export function resetAssetsStore() {
  useAssetsStore.setState({ ...initialState });
}
