import { create } from "zustand"

interface MetricsStore {
  fps: number
  setFps: (fps: number) => void
}

export const useMetricsStore = create<MetricsStore>((set) => ({
  fps: 0,
  setFps: (fps) => {
    set({ fps })
  },
}))
