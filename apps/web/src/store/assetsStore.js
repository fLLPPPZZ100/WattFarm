import { create } from 'zustand';
import { auth } from '../firebase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function fetchWithAuth(url, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const token = await user.getIdToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const useAssetsStore = create((set, get) => ({
  catalog: [],
  totalW: 0,
  vltBalance: 0,
  assets: [],
  loading: false,
  error: null,

  fetchCatalog: async () => {
    try {
      const data = await fetchWithAuth(`${API_URL}/api/assets/catalog`);
      set({ catalog: data.catalog, error: null });
    } catch (err) {
      set({ error: err.message });
    }
  },

  fetchMining: async () => {
    try {
      const data = await fetchWithAuth(`${API_URL}/api/assets/mine`);
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
      const data = await fetchWithAuth(`${API_URL}/api/assets/buy`, {
        method: 'POST',
        body: JSON.stringify({ type, quantity: quantity || 1 }),
      });
      await Promise.all([get().fetchCatalog(), get().fetchMining()]);
      set({ loading: false });
      return data;
    } catch (err) {
      set({ loading: false, error: err.message });
      throw err;
    }
  },
}));