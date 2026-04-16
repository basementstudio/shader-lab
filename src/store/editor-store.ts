import { create } from "zustand"
import { getDefaultProjectComposition } from "@/lib/editor/default-project"
import { DEFAULT_CANVAS_SIZE } from "@/lib/editor/layers"
import type { EditorRenderer } from "@/renderer/contracts"
import type {
  EditorStateSnapshot,
  MobileEditorPanel,
  RenderScale,
  SceneConfig,
  SidebarView,
  WebGPUStatus,
} from "@/types/editor"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

const DEFAULT_PROJECT_COMPOSITION = getDefaultProjectComposition()

export interface EditorStoreState extends EditorStateSnapshot {
  activeFloatingPanelDrag:
    | "layers"
    | "properties"
    | "timeline"
    | "topbar"
    | null
  floatingPanels: Record<
    "layers" | "properties" | "timeline" | "topbar",
    {
      x: number
      y: number
      z: number
    }
  >
  floatingPanelZCounter: number
  floatingPanelsResetting: boolean
  floatingPanelsResetToken: number
  liveRenderer: EditorRenderer | null
  mobilePanel: MobileEditorPanel
  startupPreviewDismissed: boolean
}

export interface EditorStoreActions {
  beginInteractiveEdit: () => void
  closeTimelinePanel: () => void
  dismissStartupPreview: () => void
  endInteractiveEdit: () => void
  enterImmersiveCanvas: () => void
  exitImmersiveCanvas: () => void
  focusFloatingPanel: (
    panel: "layers" | "properties" | "timeline" | "topbar"
  ) => void
  openTimelinePanel: () => void
  resetFloatingPanels: () => void
  resetView: () => void
  setCanvasSize: (width: number, height: number) => void
  setFloatingPanelDragging: (
    panel: "layers" | "properties" | "timeline" | "topbar" | null
  ) => void
  setFloatingPanelOffset: (
    panel: "layers" | "properties" | "timeline" | "topbar",
    x: number,
    y: number
  ) => void
  setImmersiveCanvas: (immersiveCanvas: boolean) => void
  setOutputSize: (width: number, height: number) => void
  setPan: (x: number, y: number) => void
  setRenderScale: (scale: RenderScale) => void
  setSidebarOpen: (side: "left" | "right", open: boolean) => void
  setTheme: (theme: "dark" | "light") => void
  setTimelineAutoKey: (enabled: boolean) => void
  setTimelinePanelOpen: (open: boolean) => void
  setSidebarView: (view: SidebarView) => void
  setLiveRenderer: (renderer: EditorRenderer | null) => void
  setMobilePanel: (panel: MobileEditorPanel) => void
  setWebGPUStatus: (status: WebGPUStatus, error?: string | null) => void
  setZoom: (zoom: number) => void
  toggleMobilePanel: (panel: Exclude<MobileEditorPanel, "none">) => void
  toggleTimelineAutoKey: () => void
  toggleTimelinePanel: () => void
  toggleSidebar: (side: "left" | "right") => void
  updateSceneConfig: (updates: Partial<SceneConfig>) => void
}

export type EditorStore = EditorStoreState & EditorStoreActions

const ZOOM_MIN = 0.125
const ZOOM_MAX = 6
const DEFAULT_FLOATING_PANELS = {
  layers: { x: 0, y: 0, z: 1 },
  properties: { x: 0, y: 0, z: 2 },
  topbar: { x: 0, y: 0, z: 3 },
  timeline: { x: 0, y: 0, z: 4 },
} as const

function clampCanvasDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.max(1, Math.round(value))
}

export const useEditorStore = create<EditorStore>((set) => ({
  activeFloatingPanelDrag: null,
  canvasSize: DEFAULT_CANVAS_SIZE,
  floatingPanels: DEFAULT_FLOATING_PANELS,
  floatingPanelZCounter: 4,
  floatingPanelsResetting: false,
  floatingPanelsResetToken: 0,
  immersiveCanvas: false,
  interactiveEditDepth: 0,
  liveRenderer: null,
  mobilePanel: "none",
  outputSize: DEFAULT_PROJECT_COMPOSITION,
  panOffset: { x: 0, y: 0 },
  renderScale: 1,
  sceneConfig: DEFAULT_SCENE_CONFIG,
  sidebars: {
    left: true,
    right: true,
  },
  sidebarView: "properties",
  theme: "dark",
  timelineAutoKey: true,
  timelinePanelOpen: false,
  webgpuError: null,
  webgpuStatus: "idle",
  zoom: 1,
  startupPreviewDismissed: false,

  dismissStartupPreview: () => {
    set((state) =>
      state.startupPreviewDismissed
        ? state
        : {
            startupPreviewDismissed: true,
          }
    )
  },

  beginInteractiveEdit: () => {
    set((state) => ({
      interactiveEditDepth: state.interactiveEditDepth + 1,
    }))
  },

  endInteractiveEdit: () => {
    set((state) => ({
      interactiveEditDepth: Math.max(0, state.interactiveEditDepth - 1),
    }))
  },

  setFloatingPanelOffset: (panel, x, y) => {
    set((state) => ({
      floatingPanels: {
        ...state.floatingPanels,
        [panel]: {
          ...state.floatingPanels[panel],
          x,
          y,
        },
      },
    }))
  },

  setFloatingPanelDragging: (panel) => {
    set((state) =>
      state.activeFloatingPanelDrag === panel
        ? state
        : { activeFloatingPanelDrag: panel }
    )
  },

  focusFloatingPanel: (panel) => {
    set((state) => {
      const nextZ = state.floatingPanelZCounter + 1

      if (state.floatingPanels[panel].z === nextZ) {
        return state
      }

      return {
        floatingPanels: {
          ...state.floatingPanels,
          [panel]: {
            ...state.floatingPanels[panel],
            z: nextZ,
          },
        },
        floatingPanelZCounter: nextZ,
      }
    })
  },

  resetFloatingPanels: () => {
    set((state) => ({
      floatingPanelsResetting: true,
      floatingPanelsResetToken: state.floatingPanelsResetToken + 1,
    }))

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        set({
          floatingPanels: DEFAULT_FLOATING_PANELS,
          floatingPanelZCounter: 4,
        })

        setTimeout(() => {
          set({ floatingPanelsResetting: false })
        }, 270)
      })
    })
  },

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
      mobilePanel: immersiveCanvas ? "none" : state.mobilePanel,
      timelinePanelOpen: immersiveCanvas ? false : state.timelinePanelOpen,
    }))
  },

  setMobilePanel: (mobilePanel) => {
    set({
      immersiveCanvas: false,
      mobilePanel,
    })
  },

  setTimelinePanelOpen: (timelinePanelOpen) => {
    set({
      timelinePanelOpen,
    })
  },

  setTimelineAutoKey: (timelineAutoKey) => {
    set({
      timelineAutoKey,
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

  toggleTimelineAutoKey: () => {
    set((state) => ({
      timelineAutoKey: !state.timelineAutoKey,
    }))
  },

  enterImmersiveCanvas: () => {
    set((state) => ({
      immersiveCanvas: true,
      mobilePanel: "none",
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
      mobilePanel: "none",
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

  toggleMobilePanel: (panel) => {
    set((state) => ({
      immersiveCanvas: false,
      mobilePanel: state.mobilePanel === panel ? "none" : panel,
    }))
  },

  setSidebarView: (sidebarView) => {
    set({ sidebarView })
  },

  setTheme: (theme) => {
    set({
      theme,
    })
  },

  updateSceneConfig: (updates) => {
    set((state) => ({
      sceneConfig: { ...state.sceneConfig, ...updates },
    }))
  },

  setLiveRenderer: (liveRenderer) => {
    set({ liveRenderer })
  },

  setWebGPUStatus: (webgpuStatus, webgpuError = null) => {
    set({
      webgpuError,
      webgpuStatus,
    })
  },
}))
