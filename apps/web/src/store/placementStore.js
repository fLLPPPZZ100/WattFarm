import { create } from 'zustand';

/**
 * What the Phaser scene has placed, mirrored for the React UI.
 *
 * `powerRate` is the output of installed panels including mount bonuses, and
 * `networkBaseline` is the synthetic competing power. Together they give the
 * share of the block reward the player is earning, which is the number that
 * actually matters — panel count alone says nothing about income now that
 * mounts grant bonuses.
 *
 * Mounts are counted per type as well as in total. `placedMount` alone is
 * ambiguous: Storage has to subtract placed items from owned ones *per asset
 * type*, and a combined figure cannot say how many of each is on the field.
 */
const initialState = {
  placedSolar: 0,
  /** Single + double, for callers that only need "how many mounts are down". */
  placedMount: 0,
  placedMountSingle: 0,
  placedMountDouble: 0,
  powerRate: 0,
  networkBaseline: 0,
};

export const usePlacementStore = create((set) => ({
  ...initialState,

  /**
   * Called from the game's placement callback on every layout change.
   *
   * Every field is optional and falls back to the current value, so a caller
   * that knows only part of the picture cannot zero the rest.
   */
  setPlacement: ({
    placedSolar,
    placedMount,
    placedMountSingle,
    placedMountDouble,
    powerRate,
    networkBaseline,
  } = {}) =>
    set((state) => ({
      placedSolar: placedSolar ?? state.placedSolar,
      placedMount: placedMount ?? state.placedMount,
      placedMountSingle: placedMountSingle ?? state.placedMountSingle,
      placedMountDouble: placedMountDouble ?? state.placedMountDouble,
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
