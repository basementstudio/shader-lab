import { create } from "zustand"

export interface RemixOrigin {
  slug: string
  title: string
}

interface RemixOriginState {
  clearRemixOrigin: () => void
  origin: RemixOrigin | null
  setRemixOrigin: (origin: RemixOrigin) => void
}

export const useRemixOriginStore = create<RemixOriginState>((set) => ({
  clearRemixOrigin: () => set({ origin: null }),
  origin: null,
  setRemixOrigin: (origin) => set({ origin }),
}))
