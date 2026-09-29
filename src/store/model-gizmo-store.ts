import { create } from "zustand"

export type ModelGizmoMode = "move" | "rotate" | "scale"

export const MODEL_GIZMO_MODES: readonly { id: ModelGizmoMode; label: string; key: string }[] = [
  { id: "move", key: "G", label: "Move" },
  { id: "rotate", key: "R", label: "Rotate" },
  { id: "scale", key: "S", label: "Scale" },
]

export const useModelGizmoStore = create<{
  mode: ModelGizmoMode
  setMode: (mode: ModelGizmoMode) => void
}>((set) => ({
  mode: "rotate",
  setMode: (mode) => set({ mode }),
}))
