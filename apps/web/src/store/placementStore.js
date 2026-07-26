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
  /** Baseline plus every player's output — the payout share denominator. */
  networkTotal: 0,
  networkBaseline: 0,
};

export const usePlacementStore = create((set) => ({
  ...initialState,

  setPlacedSolar: (n) => set({ placedSolar: n }),
  setPlacedMount: (n) => set({ placedMount: n }),

  /** Called from the game's placement callback on every layout change. */
  setPlacement: ({ placedSolar, placedMount, powerRate, networkTotal, networkBaseline }) =>
    set((state) => ({
      placedSolar: placedSolar ?? state.placedSolar,
      placedMount: placedMount ?? state.placedMount,
      powerRate: powerRate ?? state.powerRate,
      // These arrive from the server; keep the last known values if a callback
      // omits them.
      networkTotal: networkTotal ?? state.networkTotal,
      networkBaseline: networkBaseline ?? state.networkBaseline,
    })),
}));

/**
 * Share of the network, as a percentage.
 *
 * Divides by the server's network total rather than `powerRate + baseline`,
 * because once other players exist their output is part of the denominator too.
 */
export function networkSharePercent({ powerRate, networkTotal }) {
  if (!networkTotal || networkTotal <= 0) return 0;
  return ((powerRate || 0) / networkTotal) * 100;
}

/** Clears per-user state on logout. */
export function resetPlacementStore() {
  usePlacementStore.setState({ ...initialState });
}
