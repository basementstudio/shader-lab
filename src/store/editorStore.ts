import { create } from "zustand"
import type {
  EditorStateSnapshot,
  RenderScale,
  WebGPUStatus,
} from "@/features/editor/types"
import { DEFAULT_CANVAS_SIZE } from "@/features/editor/utils/layers"

export interface EditorStoreState extends EditorStateSnapshot {}

export interface EditorStoreActions {
  closeTimelinePanel: () => void
  enterImmersiveCanvas: () => void
  exitImmersiveCanvas: () => void
  openTimelinePanel: () => void
  resetView: () => void
  setCanvasSize: (width: number, height: number) => void
  setFps: (fps: number) => void
  setImmersiveCanvas: (immersiveCanvas: boolean) => void
  setOutputSize: (width: number, height: number) => void
  setPan: (x: number, y: number) => void
  setRenderScale: (scale: RenderScale) => void
  setSidebarOpen: (side: "left" | "right", open: boolean) => void
  setTheme: (theme: "dark" | "light") => void
  setTimelinePanelOpen: (open: boolean) => void
  setWebGPUStatus: (status: WebGPUStatus, error?: string | null) => void
  setZoom: (zoom: number) => void
  toggleTimelinePanel: () => void
  toggleSidebar: (side: "left" | "right") => void
}

export type EditorStore = EditorStoreState & EditorStoreActions

const ZOOM_MIN = 0.125
const ZOOM_MAX = 6

function clampCanvasDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.max(1, Math.round(value))
}

export const useEditorStore = create<EditorStore>((set) => ({
  canvasSize: DEFAULT_CANVAS_SIZE,
  fps: 0,
  immersiveCanvas: false,
  outputSize: DEFAULT_CANVAS_SIZE,
  panOffset: { x: 0, y: 0 },
  renderScale: 1,
  sidebars: {
    left: true,
    right: true,
  },
  theme: "dark",
  timelinePanelOpen: false,
  webgpuError: null,
  webgpuStatus: "idle",
  zoom: 1,

  setZoom: (zoom) => {
    set({
      zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)),
    })
  },

  setPan: (x, y) => {
    set({
      panOffset: { x, y },
    })
  },

  resetView: () => {
    set({
      panOffset: { x: 0, y: 0 },
      zoom: 1,
    })
  },

  setCanvasSize: (width, height) => {
    set((state) => {
      const nextSize = {
        height: clampCanvasDimension(height),
        width: clampCanvasDimension(width),
      }

      if (
        state.canvasSize.width === nextSize.width &&
        state.canvasSize.height === nextSize.height
      ) {
        return state
      }

      return {
        canvasSize: nextSize,
      }
    })
  },

  setOutputSize: (width, height) => {
    set({
      outputSize: {
        height: clampCanvasDimension(height),
        width: clampCanvasDimension(width),
      },
    })
  },

  setRenderScale: (renderScale) => {
    set({
      renderScale,
    })
  },

  setImmersiveCanvas: (immersiveCanvas) => {
    set((state) => ({
      immersiveCanvas,
      timelinePanelOpen: immersiveCanvas ? false : state.timelinePanelOpen,
    }))
  },

  setTimelinePanelOpen: (timelinePanelOpen) => {
    set({
      timelinePanelOpen,
    })
  },

  openTimelinePanel: () => {
    set({
      timelinePanelOpen: true,
    })
  },

  closeTimelinePanel: () => {
    set({
      timelinePanelOpen: false,
    })
  },

  toggleTimelinePanel: () => {
    set((state) => ({
      timelinePanelOpen: !state.timelinePanelOpen,
    }))
  },

  enterImmersiveCanvas: () => {
    set((state) => ({
      immersiveCanvas: true,
      sidebars: {
        ...state.sidebars,
        left: false,
        right: false,
      },
      timelinePanelOpen: false,
    }))
  },

  exitImmersiveCanvas: () => {
    set((state) => ({
      immersiveCanvas: false,
      sidebars: {
        ...state.sidebars,
        left: true,
        right: true,
      },
      timelinePanelOpen: false,
    }))
  },

  setSidebarOpen: (side, open) => {
    set((state) => ({
      immersiveCanvas: open ? false : state.immersiveCanvas,
      sidebars: {
        ...state.sidebars,
        [side]: open,
      },
    }))
  },

  toggleSidebar: (side) => {
    set((state) => ({
      immersiveCanvas: state.sidebars[side] ? state.immersiveCanvas : false,
      sidebars: {
        ...state.sidebars,
        [side]: !state.sidebars[side],
      },
    }))
  },

  setTheme: (theme) => {
    set({
      theme,
    })
  },

  setFps: (fps) => {
    set({
      fps,
    })
  },

  setWebGPUStatus: (webgpuStatus, webgpuError = null) => {
    set({
      webgpuError,
      webgpuStatus,
    })
  },
}))
