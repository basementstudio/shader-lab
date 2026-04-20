import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  GraphicsPreset,
  GraphicsPresetMode,
  GraphicsPresetSettings,
} from "@/lib/editor/graphics-preset"
import { getPresetSettings } from "@/lib/editor/graphics-preset"

interface GraphicsPresetState {
  mode: GraphicsPresetMode
  detected: GraphicsPreset | null
  hasDetected: boolean
}

interface GraphicsPresetActions {
  setMode: (mode: GraphicsPresetMode) => void
  setDetected: (detected: GraphicsPreset) => void
  markDetected: () => void
  resetDetection: () => void
}

export type GraphicsPresetStore = GraphicsPresetState & GraphicsPresetActions

export const useGraphicsPresetStore = create<GraphicsPresetStore>()(
  persist(
    (set) => ({
      mode: "auto",
      detected: null,
      hasDetected: false,

      setMode: (mode) => {
        set({ mode })
      },

      setDetected: (detected) => {
        set({ detected, hasDetected: true })
      },

      markDetected: () => {
        set({ hasDetected: true })
      },

      resetDetection: () => {
        set({ detected: null, hasDetected: false })
      },
    }),
    {
      name: "shader-lab:graphics-preset",
      partialize: (state) => ({
        mode: state.mode,
        detected: state.detected,
        hasDetected: state.hasDetected,
      }),
    }
  )
)

export function getActivePresetSettings(): GraphicsPresetSettings {
  const { mode, detected } = useGraphicsPresetStore.getState()
  return getPresetSettings(mode, detected)
}
