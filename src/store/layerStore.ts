import { create } from "zustand"
import { getLayerDefinition } from "@/features/editor/config/layer-registry"
import type {
  BlendMode,
  EditorLayer,
  LayerCompositeMode,
  LayerType,
  ParameterValue,
} from "@/features/editor/types"
import {
  clampLayerAdjustments,
  cloneLayer,
  createLayer,
  resetLayerParameters,
} from "@/features/editor/utils/layers"
import {
  cloneParameterValue,
  getParameterDefinition,
} from "@/features/editor/utils/parameter-schema"

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
    hoveredLayerId?: string | null,
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
        warpAmount: 0.06,
        warpScale: 0.35,
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

export function cloneLayerList(layers: EditorLayer[]): EditorLayer[] {
  return layers.map((layer) => ({
    ...layer,
    params: { ...layer.params },
  }))
}

function countLayersOfType(layers: EditorLayer[], type: LayerType): number {
  return layers.filter((layer) => layer.type === type).length
}

function getNeighborSelection(layers: EditorLayer[], removedIndex: number): string | null {
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

      if (insertIndex === undefined || insertIndex < 0 || insertIndex > layers.length) {
        layers.unshift(nextLayer)
      } else {
        layers.splice(insertIndex, 0, nextLayer)
      }

      return {
        layers,
        selectedLayerId: nextLayer.id,
      }
    })

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
        hoveredLayerId: state.hoveredLayerId === id ? null : state.hoveredLayerId,
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
        layer.id === id ? { ...layer, name: nextName } : layer,
      ),
    }))
  },

  setLayerVisibility: (id, visible) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, visible } : layer,
      ),
    }))
  },

  setLayerLocked: (id, locked) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, locked } : layer,
      ),
    }))
  },

  setLayerExpanded: (id, expanded) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, expanded } : layer,
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
        layer.id === id ? { ...layer, blendMode } : layer,
      ),
    }))
  },

  setLayerCompositeMode: (id, compositeMode) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, compositeMode } : layer,
      ),
    }))
  },

  setLayerAsset: (id, assetId) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, assetId, runtimeError: null } : layer,
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
          key,
        )

        if (!definition) {
          return layer
        }

        const nextParams = {
          ...layer.params,
          [key]: cloneParameterValue(value),
        }

        if (layer.type === "gradient" && key === "noiseType" && typeof value === "string") {
          const defaults = getGradientNoiseDefaults(value)

          if (defaults) {
            nextParams.warpAmount = defaults.warpAmount
            nextParams.warpScale = defaults.warpScale
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
          : layer,
      ),
    }))
  },

  setLayerRuntimeError: (id, runtimeError) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, runtimeError } : layer,
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

    return state.layers.find((layer) => layer.id === state.selectedLayerId) ?? null
  },

  getLayerById: (id) => {
    return get().layers.find((layer) => layer.id === id) ?? null
  },

  getRenderableLayers: () => {
    return get().layers.filter((layer) => layer.visible)
  },
}))
