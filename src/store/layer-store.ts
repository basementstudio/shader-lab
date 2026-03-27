import { create } from "zustand"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import {
  clampLayerAdjustments,
  cloneLayer,
  createLayer,
  resetLayerParameters,
} from "@/lib/editor/layers"
import {
  cloneParameterValue,
  getParameterDefinition,
} from "@/lib/editor/parameter-schema"
import { useEditorStore } from "@/store/editor-store"
import type {
  BlendMode,
  EditorLayer,
  LayerCompositeMode,
  LayerType,
  ParameterValue,
} from "@/types/editor"

export interface LayerStoreState {
  hoveredLayerId: string | null
  layers: EditorLayer[]
  selectedLayerId: string | null
}

export interface LayerStoreActions {
  addLayer: (type: LayerType, insertIndex?: number) => string
  duplicateLayer: (id: string) => string | null
  getLayerById: (id: string) => EditorLayer | null
  getRenderableLayers: () => EditorLayer[]
  getSelectedLayer: () => EditorLayer | null
  removeLayer: (id: string) => void
  renameLayer: (id: string, name: string) => void
  replaceState: (
    layers: EditorLayer[],
    selectedLayerId?: string | null,
    hoveredLayerId?: string | null
  ) => void
  reorderLayers: (fromIndex: number, toIndex: number) => void
  resetLayerParams: (id: string) => void
  selectLayer: (id: string | null) => void
  setHoveredLayer: (id: string | null) => void
  setLayerAsset: (id: string, assetId: string | null) => void
  setLayerBlendMode: (id: string, blendMode: BlendMode) => void
  setLayerCompositeMode: (id: string, compositeMode: LayerCompositeMode) => void
  setLayerExpanded: (id: string, expanded: boolean) => void
  setLayerHue: (id: string, hue: number) => void
  setLayerLocked: (id: string, locked: boolean) => void
  setLayerOpacity: (id: string, opacity: number) => void
  setLayerRuntimeError: (id: string, error: string | null) => void
  setLayerSaturation: (id: string, saturation: number) => void
  setLayerVisibility: (id: string, visible: boolean) => void
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
}

export type LayerStore = LayerStoreState & LayerStoreActions

function getGradientNoiseDefaults(noiseType: string): {
  warpAmount: number
  warpScale: number
} | null {
  switch (noiseType) {
    case "perlin":
      return {
        warpAmount: 0.64,
        warpScale: 5.56,
      }
    case "value":
      return {
        warpAmount: 0.06,
        warpScale: 0.35,
      }
    case "voronoi":
      return {
        warpAmount: 0.3,
        warpScale: 3.0,
      }
    case "ridge":
      return {
        warpAmount: 0.2,
        warpScale: 2.0,
      }
    case "turbulence":
      return {
        warpAmount: 0.04,
        warpScale: 0.28,
      }
    case "simplex":
      return {
        warpAmount: 0.64,
        warpScale: 5.56,
      }
    default:
      return null
  }
}

function getGradientPresetDefaults(
  preset: string
): Record<string, ParameterValue> | null {
  switch (preset) {
    case "aurora":
      return {
        activePoints: 5,
        point1Color: "#ed6a5a",
        point1Position: [-0.8, -0.6],
        point1Weight: 1.0,
        point2Color: "#f4f1bb",
        point2Position: [0.2, 0.7],
        point2Weight: 1.0,
        point3Color: "#9bc1bc",
        point3Position: [0.9, -0.3],
        point3Weight: 1.0,
        point4Color: "#5d576b",
        point4Position: [-0.4, 0.5],
        point4Weight: 1.0,
        point5Color: "#e6ebe0",
        point5Position: [0.6, -0.8],
        point5Weight: 1.0,
        noiseType: "simplex",
        warpAmount: 0.8,
        warpScale: 4.0,
        warpIterations: 3,
        warpDecay: 1.0,
        warpBias: 0.65,
        vortexAmount: 0.3,
        falloff: 3.5,
        tonemapMode: "totos",
        glowStrength: 0.0,
        glowThreshold: 0.0,
        grainAmount: 0.08,
        vignetteStrength: 0.0,
        vignetteRadius: 1.5,
        vignetteSoftness: 1,
      }
    case "sunset":
      return {
        activePoints: 4,
        point1Color: "#1a0a2e",
        point1Position: [-0.6, -0.8],
        point1Weight: 0.8,
        point2Color: "#c4420a",
        point2Position: [0.3, 0.4],
        point2Weight: 1.2,
        point3Color: "#e8821a",
        point3Position: [0.8, 0.7],
        point3Weight: 0.9,
        point4Color: "#4a1942",
        point4Position: [-0.5, 0.3],
        point4Weight: 1.0,
        noiseType: "simplex",
        warpAmount: 0.6,
        warpScale: 3.5,
        warpIterations: 2,
        warpDecay: 1.2,
        warpBias: 0.5,
        vortexAmount: 0.0,
        falloff: 3.5,
        tonemapMode: "totos",
        glowStrength: 0.0,
        glowThreshold: 0.0,
        grainAmount: 0.08,
        vignetteStrength: 0.15,
        vignetteRadius: 1.4,
        vignetteSoftness: 0.8,
      }
    case "deep-ocean":
      return {
        activePoints: 4,
        point1Color: "#020b1a",
        point1Position: [0.0, -0.7],
        point1Weight: 0.8,
        point2Color: "#0a3d62",
        point2Position: [-0.6, 0.4],
        point2Weight: 1.2,
        point3Color: "#3c8dbc",
        point3Position: [0.7, 0.1],
        point3Weight: 0.9,
        point4Color: "#061224",
        point4Position: [0.3, 0.8],
        point4Weight: 1.0,
        noiseType: "turbulence",
        warpAmount: 0.04,
        warpScale: 0.28,
        warpIterations: 3,
        warpDecay: 0.8,
        warpBias: 0.4,
        vortexAmount: 0.35,
        falloff: 3.5,
        tonemapMode: "totos",
        glowStrength: 0.0,
        glowThreshold: 0.0,
        grainAmount: 0.06,
        vignetteStrength: 0.2,
        vignetteRadius: 1.3,
        vignetteSoftness: 0.7,
      }
    case "neon-glow":
      return {
        activePoints: 5,
        point1Color: "#0a0a0a",
        point1Position: [0.0, 0.0],
        point1Weight: 0.6,
        point2Color: "#b80050",
        point2Position: [-0.7, -0.5],
        point2Weight: 1.3,
        point3Color: "#0088aa",
        point3Position: [0.8, 0.3],
        point3Weight: 1.1,
        point4Color: "#220033",
        point4Position: [0.2, -0.8],
        point4Weight: 0.9,
        point5Color: "#1a0a2e",
        point5Position: [-0.5, 0.7],
        point5Weight: 1.0,
        noiseType: "simplex",
        warpAmount: 0.7,
        warpScale: 4.0,
        warpIterations: 3,
        warpDecay: 1.0,
        warpBias: 0.35,
        vortexAmount: -0.25,
        falloff: 3.5,
        tonemapMode: "totos",
        glowStrength: 0.0,
        glowThreshold: 0.0,
        grainAmount: 0.05,
        vignetteStrength: 0.1,
        vignetteRadius: 1.5,
        vignetteSoftness: 1,
      }
    default:
      return null
  }
}

function getDitheringPresetDefaults(
  preset: string
): Record<string, ParameterValue> | null {
  switch (preset) {
    case "gameboy":
      return {
        algorithm: "bayer-2x2",
        colorMode: "duo-tone",
        highlightColor: "#9bbc0f",
        levels: 4,
        pixelSize: 3,
        shadowColor: "#0f380f",
        spread: 0.5,
      }
    default:
      return null
  }
}

function getHalftonePresetDefaults(
  preset: string
): Record<string, ParameterValue> | null {
  switch (preset) {
    case "process":
      return {
        inkCyan: "#00AEEF",
        inkMagenta: "#EC008C",
        inkYellow: "#FFF200",
        inkKey: "#1a1a1a",
        paperColor: "#F5F5F0",
      }
    case "risograph":
      return {
        inkCyan: "#0078BF",
        inkMagenta: "#FF48B0",
        inkYellow: "#FFE800",
        inkKey: "#000000",
        paperColor: "#F2F0E6",
      }
    case "newspaper":
      return {
        inkCyan: "#1A6B8A",
        inkMagenta: "#8C3A5E",
        inkYellow: "#C4A832",
        inkKey: "#2B2B2B",
        paperColor: "#F0E6D0",
      }
    case "vintage":
      return {
        inkCyan: "#3A7CA5",
        inkMagenta: "#A0506A",
        inkYellow: "#D4A843",
        inkKey: "#3C3228",
        paperColor: "#EDE4D4",
      }
    default:
      return null
  }
}

export function cloneLayerList(layers: EditorLayer[]): EditorLayer[] {
  return layers.map((layer) => ({
    ...layer,
    params: { ...layer.params },
  }))
}

function countLayersOfType(layers: EditorLayer[], type: LayerType): number {
  return layers.filter((layer) => layer.type === type).length
}

function getNeighborSelection(
  layers: EditorLayer[],
  removedIndex: number
): string | null {
  const nextIndex = Math.min(removedIndex, layers.length - 1)
  const nextLayer = layers[nextIndex]

  return nextLayer?.id ?? null
}

export const useLayerStore = create<LayerStore>((set, get) => ({
  hoveredLayerId: null,
  layers: [],
  selectedLayerId: null,

  addLayer: (type, insertIndex) => {
    const existingLayers = get().layers
    const nextLayer = createLayer(type, countLayersOfType(existingLayers, type))

    set((state) => {
      const layers = [...state.layers]

      if (
        insertIndex === undefined ||
        insertIndex < 0 ||
        insertIndex > layers.length
      ) {
        layers.unshift(nextLayer)
      } else {
        layers.splice(insertIndex, 0, nextLayer)
      }

      return {
        layers,
        selectedLayerId: nextLayer.id,
      }
    })

    useEditorStore.getState().dismissStartupPreview()

    return nextLayer.id
  },

  removeLayer: (id) => {
    set((state) => {
      const removedIndex = state.layers.findIndex((layer) => layer.id === id)

      if (removedIndex === -1) {
        return state
      }

      const layers = state.layers.filter((layer) => layer.id !== id)

      return {
        hoveredLayerId:
          state.hoveredLayerId === id ? null : state.hoveredLayerId,
        layers,
        selectedLayerId:
          state.selectedLayerId === id
            ? getNeighborSelection(layers, removedIndex)
            : state.selectedLayerId,
      }
    })
  },

  duplicateLayer: (id) => {
    const sourceLayer = get().layers.find((layer) => layer.id === id)

    if (!sourceLayer) {
      return null
    }

    const duplicatedLayer = cloneLayer(sourceLayer)

    set((state) => {
      const sourceIndex = state.layers.findIndex((layer) => layer.id === id)
      const layers = [...state.layers]

      layers.splice(sourceIndex + 1, 0, duplicatedLayer)

      return {
        layers,
        selectedLayerId: duplicatedLayer.id,
      }
    })

    return duplicatedLayer.id
  },

  reorderLayers: (fromIndex, toIndex) => {
    set((state) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.layers.length ||
        toIndex >= state.layers.length ||
        fromIndex === toIndex
      ) {
        return state
      }

      const layers = [...state.layers]
      const [movedLayer] = layers.splice(fromIndex, 1)

      if (!movedLayer) {
        return state
      }

      layers.splice(toIndex, 0, movedLayer)

      return { layers }
    })
  },

  selectLayer: (selectedLayerId) => {
    set({ selectedLayerId })
  },

  setHoveredLayer: (hoveredLayerId) => {
    set({ hoveredLayerId })
  },

  renameLayer: (id, name) => {
    const nextName = name.trim()

    if (!nextName) {
      return
    }

    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, name: nextName } : layer
      ),
    }))
  },

  setLayerVisibility: (id, visible) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, visible } : layer
      ),
    }))
  },

  setLayerLocked: (id, locked) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, locked } : layer
      ),
    }))
  },

  setLayerExpanded: (id, expanded) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, expanded } : layer
      ),
    }))
  },

  setLayerOpacity: (id, opacity) => {
    set((state) => ({
      layers: state.layers.map((layer) => {
        if (layer.id !== id) {
          return layer
        }

        return {
          ...layer,
          ...clampLayerAdjustments({
            hue: layer.hue,
            opacity,
            saturation: layer.saturation,
          }),
        }
      }),
    }))
  },

  setLayerHue: (id, hue) => {
    set((state) => ({
      layers: state.layers.map((layer) => {
        if (layer.id !== id) {
          return layer
        }

        return {
          ...layer,
          ...clampLayerAdjustments({
            hue,
            opacity: layer.opacity,
            saturation: layer.saturation,
          }),
        }
      }),
    }))
  },

  setLayerSaturation: (id, saturation) => {
    set((state) => ({
      layers: state.layers.map((layer) => {
        if (layer.id !== id) {
          return layer
        }

        return {
          ...layer,
          ...clampLayerAdjustments({
            hue: layer.hue,
            opacity: layer.opacity,
            saturation,
          }),
        }
      }),
    }))
  },

  setLayerBlendMode: (id, blendMode) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, blendMode } : layer
      ),
    }))
  },

  setLayerCompositeMode: (id, compositeMode) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, compositeMode } : layer
      ),
    }))
  },

  setLayerAsset: (id, assetId) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, assetId, runtimeError: null } : layer
      ),
    }))
  },

  updateLayerParam: (id, key, value) => {
    set((state) => ({
      layers: state.layers.map((layer) => {
        if (layer.id !== id) {
          return layer
        }

        const definition = getParameterDefinition(
          getLayerDefinition(layer.type).params,
          key
        )

        if (!definition) {
          return layer
        }

        const nextParams = {
          ...layer.params,
          [key]: cloneParameterValue(value),
        }

        if (
          layer.type === "gradient" &&
          key === "noiseType" &&
          typeof value === "string"
        ) {
          const defaults = getGradientNoiseDefaults(value)

          if (defaults) {
            nextParams.warpAmount = defaults.warpAmount
            nextParams.warpScale = defaults.warpScale
          }
        }

        if (
          layer.type === "gradient" &&
          key === "preset" &&
          typeof value === "string"
        ) {
          const defaults = getGradientPresetDefaults(value)

          if (defaults) {
            Object.assign(nextParams, defaults)
          }
        }

        if (
          layer.type === "dithering" &&
          key === "preset" &&
          typeof value === "string"
        ) {
          const defaults = getDitheringPresetDefaults(value)

          if (defaults) {
            Object.assign(nextParams, defaults)
          }
        }

        if (
          layer.type === "halftone" &&
          key === "preset" &&
          typeof value === "string"
        ) {
          const defaults = getHalftonePresetDefaults(value)

          if (defaults) {
            Object.assign(nextParams, defaults)
          }
        }

        return {
          ...layer,
          params: nextParams,
          runtimeError: null,
        }
      }),
    }))
  },

  resetLayerParams: (id) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id
          ? {
              ...layer,
              params: resetLayerParameters(layer.type),
              runtimeError: null,
            }
          : layer
      ),
    }))
  },

  setLayerRuntimeError: (id, runtimeError) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, runtimeError } : layer
      ),
    }))
  },

  replaceState: (layers, selectedLayerId = null, hoveredLayerId = null) => {
    set({
      hoveredLayerId,
      layers: cloneLayerList(layers),
      selectedLayerId,
    })
  },

  getSelectedLayer: () => {
    const state = get()

    return (
      state.layers.find((layer) => layer.id === state.selectedLayerId) ?? null
    )
  },

  getLayerById: (id) => {
    return get().layers.find((layer) => layer.id === id) ?? null
  },

  getRenderableLayers: () => {
    return get().layers.filter((layer) => layer.visible)
  },
}))
