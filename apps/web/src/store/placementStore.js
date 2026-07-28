import { create } from 'zustand';

/**
 * What the Phaser scene has placed, mirrored for the React UI.
 *
 * `powerRate` is the output of installed panels including mount bonuses, and
 * `networkBaseline` is the synthetic competing power. Together they give the
 * share of the block reward the player is earning, which is the number that
 * actually matters — panel count alone says nothing about income now that
 * mounts grant bonuses.
 */
const initialState = {
  placedSolar: 0,
  placedMount: 0,
  powerRate: 0,
  networkBaseline: 0,
};

export const usePlacementStore = create((set) => ({
  ...initialState,

  setPlacedSolar: (n) => set({ placedSolar: n }),
  setPlacedMount: (n) => set({ placedMount: n }),

  /** Called from the game's placement callback on every layout change. */
  setPlacement: ({ placedSolar, placedMount, powerRate, networkBaseline }) =>
    set((state) => ({
      placedSolar: placedSolar ?? state.placedSolar,
      placedMount: placedMount ?? state.placedMount,
      powerRate: powerRate ?? state.powerRate,
      // The baseline arrives from the server; keep the last known value if a
      // callback omits it.
      networkBaseline: networkBaseline ?? state.networkBaseline,
    })),
}));

/** Clears per-user state on logout. */
export function resetPlacementStore() {
  usePlacementStore.setState({ ...initialState });
}
