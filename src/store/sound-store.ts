"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export interface SoundStoreState {
  enabled: boolean
}

export interface SoundStoreActions {
  setEnabled: (enabled: boolean) => void
  toggleEnabled: () => void
}

export type SoundStore = SoundStoreState & SoundStoreActions

export const useSoundStore = create<SoundStore>()(
  persist(
    (set) => ({
      enabled: true,

      setEnabled: (enabled) => {
        set({ enabled })
      },

      toggleEnabled: () => {
        set((state) => ({
          enabled: !state.enabled,
        }))
      },
    }),
    {
      name: "shader-lab-ui-sound",
      storage: createJSONStorage(() => localStorage),
    }
  )
)
