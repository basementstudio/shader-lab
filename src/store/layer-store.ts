import { create } from "zustand"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import {
  getDefaultProjectLayers,
  getDefaultProjectSelectedLayerId,
} from "@/lib/editor/default-project"
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
import { normalizeTextFontWeight } from "@/lib/editor/text-fonts"
import { useEditorStore } from "@/store/editor-store"
import type {
  BlendMode,
  EditorLayer,
  LayerCompositeMode,
  LayerParameterValues,
  LayerType,
  MaskConfig,
  ParameterValue,
} from "@/types/editor"
import { DEFAULT_MASK_CONFIG } from "@/types/editor"

export interface LayerStoreState {
  hoveredLayerId: string | null
  layers: EditorLayer[]
  selectedLayerIds: string[]
  selectedLayerId: string | null
  selectionAnchorId: string | null
}

export interface LayerStoreActions {
  addLayer: (type: LayerType, insertIndex?: number) => string
  duplicateLayer: (id: string) => string | null
  getLayerById: (id: string) => EditorLayer | null
  getRenderableLayers: () => EditorLayer[]
  getSelectedLayer: () => EditorLayer | null
  removeLayer: (id: string) => void
  removeLayers: (ids: string[]) => void
  renameLayer: (id: string, name: string) => void
  replaceState: (
    layers: EditorLayer[],
    selectedLayerId?: string | null,
    hoveredLayerId?: string | null,
    selectedLayerIds?: string[]
  ) => void
  reorderLayers: (fromIndex: number, toIndex: number) => void
  resetLayerParams: (id: string) => void
  selectLayer: (id: string | null) => void
  selectLayerRange: (id: string) => void
  selectLayerWithModifiers: (
    id: string,
    options?: { additive?: boolean; range?: boolean }
  ) => void
  setHoveredLayer: (id: string | null) => void
  setLayerAsset: (id: string, assetId: string | null) => void
  setLayerBlendMode: (id: string, blendMode: BlendMode) => void
  setLayerCompositeMode: (id: string, compositeMode: LayerCompositeMode) => void
  setLayerMaskConfig: (id: string, updates: Partial<MaskConfig>) => void
  setLayerExpanded: (id: string, expanded: boolean) => void
  setLayerHue: (id: string, hue: number) => void
  setLayerLocked: (id: string, locked: boolean) => void
  setLayerOpacity: (id: string, opacity: number) => void
  setLayerRuntimeError: (id: string, error: string | null) => void
  setLayerSaturation: (id: string, saturation: number) => void
  setLayerVisibility: (id: string, visible: boolean) => void
  setLayersVisibility: (ids: string[], visible: boolean) => void
  randomizeGradientParams: (id: string) => void
  updateLayerParam: (id: string, key: string, value: ParameterValue) => void
}

export type LayerStore = LayerStoreState & LayerStoreActions

const DEFAULT_SELECTED_LAYER_ID = getDefaultProjectSelectedLayerId()

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
        warpAmount: 0.18,
        warpScale: 2.35,
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

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1))
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function randomChoice<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)] as T
}

function randomHexColor(): string {
  const hue = randomInt(0, 359)
  const saturation = randomInt(45, 95) / 100
  const lightness = randomInt(30, 78) / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const hueSector = hue / 60
  const x = chroma * (1 - Math.abs((hueSector % 2) - 1))
  const match = lightness - chroma / 2

  let r = 0
  let g = 0
  let b = 0

  if (hueSector < 1) {
    r = chroma
    g = x
  } else if (hueSector < 2) {
    r = x
    g = chroma
  } else if (hueSector < 3) {
    g = chroma
    b = x
  } else if (hueSector < 4) {
    g = x
    b = chroma
  } else if (hueSector < 5) {
    r = x
    b = chroma
  } else {
    r = chroma
    b = x
  }

  const toHex = (channel: number) =>
    Math.round((channel + match) * 255)
      .toString(16)
      .padStart(2, "0")

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function buildRandomGradientParams(): LayerParameterValues {
  const params = resetLayerParameters("gradient")
  const noiseType = randomChoice([
    "simplex",
    "perlin",
    "value",
    "voronoi",
    "ridge",
    "turbulence",
  ] as const)
  const noiseDefaults = getGradientNoiseDefaults(noiseType)

  params.preset = "custom"
  params.activePoints = randomInt(2, 5)

  for (let index = 1; index <= 5; index += 1) {
    params[`point${index}Color`] = randomHexColor()
    params[`point${index}Position`] = [
      Number(randomBetween(-1.1, 1.1).toFixed(2)),
      Number(randomBetween(-1.1, 1.1).toFixed(2)),
    ]
    params[`point${index}Weight`] = Number(randomBetween(0.2, 2.4).toFixed(2))
  }

  params.noiseType = noiseType
  params.noiseSeed = Number(randomBetween(0, 100).toFixed(1))
  params.warpAmount = Number(
    clampValue(
      randomBetween(
        (noiseDefaults?.warpAmount ?? 0.3) * 0.6,
        (noiseDefaults?.warpAmount ?? 0.3) * 1.4 + 0.08
      ),
      0,
      1
    ).toFixed(2)
  )
  params.warpScale = Number(
    clampValue(
      randomBetween(
        (noiseDefaults?.warpScale ?? 2.5) * 0.6,
        (noiseDefaults?.warpScale ?? 2.5) * 1.4 + 0.2
      ),
      0.1,
      6
    ).toFixed(2)
  )
  params.warpIterations = randomInt(1, 4)
  params.warpDecay = Number(randomBetween(0.4, 1.8).toFixed(2))
  params.warpBias = Number(randomBetween(0, 1).toFixed(2))
  params.vortexAmount = Number(randomBetween(-1, 1).toFixed(2))
  params.animate = Math.random() > 0.2
  params.motionAmount = Number(randomBetween(0, 1).toFixed(2))
  params.motionSpeed = Number(randomBetween(0, 2).toFixed(2))
  params.falloff = Number(randomBetween(0.8, 3.8).toFixed(2))
  params.tonemapMode = randomChoice([
    "none",
    "aces",
    "reinhard",
    "totos",
    "cinematic",
  ] as const)
  params.glowStrength = Number(randomBetween(0, 0.45).toFixed(2))
  params.glowThreshold = Number(randomBetween(0, 0.6).toFixed(2))
  params.grainAmount = Number(randomBetween(0, 0.25).toFixed(2))
  params.vignetteStrength = Number(randomBetween(0, 0.35).toFixed(2))
  params.vignetteRadius = Number(randomBetween(0.6, 1.5).toFixed(2))
  params.vignetteSoftness = Number(randomBetween(0.2, 1).toFixed(2))

  return params
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

function getSelectionAfterRemoval(
  layers: EditorLayer[],
  removedIndices: number[]
): string | null {
  if (layers.length === 0 || removedIndices.length === 0) {
    return null
  }

  return getNeighborSelection(layers, Math.min(...removedIndices))
}

export const useLayerStore = create<LayerStore>((set, get) => ({
  hoveredLayerId: null,
  layers: getDefaultProjectLayers(),
  selectedLayerIds: DEFAULT_SELECTED_LAYER_ID
    ? [DEFAULT_SELECTED_LAYER_ID]
    : [],
  selectedLayerId: DEFAULT_SELECTED_LAYER_ID,
  selectionAnchorId: DEFAULT_SELECTED_LAYER_ID,

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
        selectedLayerIds: [nextLayer.id],
        selectedLayerId: nextLayer.id,
        selectionAnchorId: nextLayer.id,
      }
    })

    useEditorStore.getState().dismissStartupPreview()

    return nextLayer.id
  },

  removeLayer: (id) => {
    get().removeLayers([id])
  },

  removeLayers: (ids) => {
    const idSet = new Set(ids)

    if (idSet.size === 0) {
      return
    }

    set((state) => {
      const removedIndices = state.layers.flatMap((layer, index) =>
        idSet.has(layer.id) ? [index] : []
      )

      if (removedIndices.length === 0) {
        return state
      }

      const layers = state.layers.filter((layer) => !idSet.has(layer.id))
      const selectedLayerIds = state.selectedLayerIds.filter(
        (selectedId) => !idSet.has(selectedId)
      )

      const nextSelectedLayerId =
        selectedLayerIds.find(
          (selectedId) => selectedId === state.selectedLayerId
        ) ??
        selectedLayerIds.at(-1) ??
        getSelectionAfterRemoval(layers, removedIndices)
      let nextSelectedLayerIds: string[] = []

      if (nextSelectedLayerId) {
        nextSelectedLayerIds =
          selectedLayerIds.length > 0 ? selectedLayerIds : [nextSelectedLayerId]
      }

      return {
        hoveredLayerId:
          state.hoveredLayerId && idSet.has(state.hoveredLayerId)
            ? null
            : state.hoveredLayerId,
        layers,
        selectedLayerIds: nextSelectedLayerIds,
        selectedLayerId: nextSelectedLayerId,
        selectionAnchorId:
          state.selectionAnchorId && idSet.has(state.selectionAnchorId)
            ? nextSelectedLayerId
            : state.selectionAnchorId,
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
        selectedLayerIds: [duplicatedLayer.id],
        selectedLayerId: duplicatedLayer.id,
        selectionAnchorId: duplicatedLayer.id,
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
    set({
      selectedLayerIds: selectedLayerId ? [selectedLayerId] : [],
      selectedLayerId,
      selectionAnchorId: selectedLayerId,
    })
  },

  selectLayerRange: (selectedLayerId) => {
    get().selectLayerWithModifiers(selectedLayerId, { range: true })
  },

  selectLayerWithModifiers: (selectedLayerId, options = {}) => {
    const { additive = false, range = false } = options

    set((state) => {
      const targetIndex = state.layers.findIndex(
        (layer) => layer.id === selectedLayerId
      )

      if (targetIndex === -1) {
        return state
      }

      if (range) {
        const anchorId =
          state.selectionAnchorId ?? state.selectedLayerId ?? selectedLayerId
        const anchorIndex = state.layers.findIndex(
          (layer) => layer.id === anchorId
        )

        if (anchorIndex === -1) {
          return {
            selectedLayerIds: [selectedLayerId],
            selectedLayerId,
            selectionAnchorId: selectedLayerId,
          }
        }

        const rangeIds = state.layers
          .slice(
            Math.min(anchorIndex, targetIndex),
            Math.max(anchorIndex, targetIndex) + 1
          )
          .map((layer) => layer.id)

        return {
          selectedLayerIds: additive
            ? Array.from(new Set([...state.selectedLayerIds, ...rangeIds]))
            : rangeIds,
          selectedLayerId,
          selectionAnchorId: anchorId,
        }
      }

      if (additive) {
        const isSelected = state.selectedLayerIds.includes(selectedLayerId)
        const selectedLayerIds = isSelected
          ? state.selectedLayerIds.filter((id) => id !== selectedLayerId)
          : [...state.selectedLayerIds, selectedLayerId]
        let nextSelectedLayerId: string | null = selectedLayerId

        if (isSelected) {
          nextSelectedLayerId =
            state.selectedLayerId === selectedLayerId
              ? (selectedLayerIds.at(-1) ?? null)
              : state.selectedLayerId
        }

        return {
          selectedLayerIds,
          selectedLayerId: nextSelectedLayerId,
          selectionAnchorId: selectedLayerId,
        }
      }

      return {
        selectedLayerIds: [selectedLayerId],
        selectedLayerId,
        selectionAnchorId: selectedLayerId,
      }
    })
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
    get().setLayersVisibility([id], visible)
  },

  setLayersVisibility: (ids, visible) => {
    const idSet = new Set(ids)

    if (idSet.size === 0) {
      return
    }

    set((state) => ({
      layers: state.layers.map((layer) =>
        idSet.has(layer.id) ? { ...layer, visible } : layer
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

  setLayerMaskConfig: (id, updates) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id
          ? { ...layer, maskConfig: { ...layer.maskConfig, ...updates } }
          : layer
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

  randomizeGradientParams: (id) => {
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id && layer.type === "gradient"
          ? {
              ...layer,
              params: buildRandomGradientParams(),
              runtimeError: null,
            }
          : layer
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

        if (layer.type === "text") {
          if (key === "fontFamily" && typeof value === "string") {
            nextParams.fontWeight = normalizeTextFontWeight(
              value,
              nextParams.fontWeight
            )
          }

          if (key === "fontWeight") {
            const fontFamily =
              typeof nextParams.fontFamily === "string"
                ? nextParams.fontFamily
                : "display-serif"

            nextParams.fontWeight = normalizeTextFontWeight(fontFamily, value)
          }
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

  replaceState: (
    layers,
    selectedLayerId = null,
    hoveredLayerId = null,
    selectedLayerIds = []
  ) => {
    const normalizedSelectedLayerIds = (selectedLayerIds ?? []).filter((id) =>
      layers.some((layer) => layer.id === id)
    )
    let nextSelectedLayerIds: string[] = []

    if (normalizedSelectedLayerIds.length > 0) {
      nextSelectedLayerIds = normalizedSelectedLayerIds
    } else if (selectedLayerId) {
      nextSelectedLayerIds = [selectedLayerId]
    }

    set({
      hoveredLayerId,
      layers: cloneLayerList(layers).map((layer) => ({
        ...layer,
        maskConfig: layer.maskConfig ?? { ...DEFAULT_MASK_CONFIG },
      })),
      selectedLayerIds: nextSelectedLayerIds,
      selectedLayerId:
        (selectedLayerId &&
          nextSelectedLayerIds.find((id) => id === selectedLayerId)) ??
        nextSelectedLayerIds.at(-1) ??
        null,
      selectionAnchorId:
        (selectedLayerId &&
          nextSelectedLayerIds.find((id) => id === selectedLayerId)) ??
        nextSelectedLayerIds.at(-1) ??
        null,
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
