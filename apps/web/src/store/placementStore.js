import { create } from 'zustand';

export const usePlacementStore = create(function (set) {
  return {
    placedSolar: 0,
    placedMount: 0,
    setPlacedSolar: function (n) { set({ placedSolar: n }); },
    setPlacedMount: function (n) { set({ placedMount: n }); },
  };
});