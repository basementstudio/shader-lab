import { create } from "zustand"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import {
  getDefaultProjectLayers,
  getDefaultProjectSelectedLayerId,
} from "@/lib/editor/default-project"
import {
  getDescendantLayerIds,
  getIndexAfterSubtree,
  getSubtreeLayerIds,
  isDescendantLayer,
  isGroupLayer,
  normalizeParentGroupId,
} from "@/lib/editor/layer-groups"
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
import { useTimelineStore } from "@/store/timeline-store"
import type {
  BlendMode,
  EditorLayer,
  LayerCompositeMode,
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
  addLayer: (
    type: LayerType,
    insertIndex?: number,
    parentGroupId?: string | null
  ) => string
  createGroup: (insertIndex?: number) => string
  duplicateLayer: (id: string) => string | null
  getLayerDescendantIds: (id: string) => string[]
  getLayerById: (id: string) => EditorLayer | null
  getRenderableLayers: () => EditorLayer[]
  getSelectedLayer: () => EditorLayer | null
  moveLayerAfter: (id: string, targetId: string) => void
  moveLayerBefore: (id: string, targetId: string) => void
  moveLayerIntoGroup: (
    id: string,
    groupId: string,
    beforeLayerId?: string | null
  ) => void
  moveLayerToRoot: (id: string, beforeLayerId?: string | null) => void
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
  ungroupLayer: (id: string) => void
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

function getSelectionAfterRemoval(
  layers: EditorLayer[],
  removedIndices: number[]
): string | null {
  if (layers.length === 0 || removedIndices.length === 0) {
    return null
  }

  return getNeighborSelection(layers, Math.min(...removedIndices))
}

function normalizeLayers(layers: EditorLayer[]): EditorLayer[] {
  const groupIds = new Set(
    layers.filter((layer) => isGroupLayer(layer)).map((layer) => layer.id)
  )

  return cloneLayerList(layers).map((layer) => {
    const parentGroupId = normalizeParentGroupId(layer, groupIds)

    if (isGroupLayer(layer)) {
      return {
        ...layer,
        assetId: null,
        expanded: typeof layer.expanded === "boolean" ? layer.expanded : true,
        maskConfig: layer.maskConfig ?? { ...DEFAULT_MASK_CONFIG },
        parentGroupId,
        params: {},
        runtimeError: layer.runtimeError ?? null,
      }
    }

    return {
      ...layer,
      expanded: typeof layer.expanded === "boolean" ? layer.expanded : true,
      maskConfig: layer.maskConfig ?? { ...DEFAULT_MASK_CONFIG },
      parentGroupId,
      runtimeError: layer.runtimeError ?? null,
    }
  })
}

function getSelectionIdsForRemoval(
  layers: EditorLayer[],
  ids: readonly string[]
): string[] {
  const idSet = new Set(ids)
  const nextIds = new Set<string>(ids)

  for (const id of idSet) {
    for (const descendantId of getDescendantLayerIds(layers, id)) {
      nextIds.add(descendantId)
    }
  }

  return [...nextIds]
}

function getValidatedParentGroupId(
  layers: EditorLayer[],
  layerId: string,
  parentGroupId: string | null
): string | null {
  if (!parentGroupId) {
    return null
  }

  const parent = layers.find((layer) => layer.id === parentGroupId)
  if (!(parent && isGroupLayer(parent))) {
    return null
  }

  if (layerId === parentGroupId || isDescendantLayer(layers, parentGroupId, layerId)) {
    return null
  }

  return parentGroupId
}

function getContainerInsertIndex(
  layers: EditorLayer[],
  parentGroupId: string | null,
  beforeLayerId: string | null
): number {
  if (beforeLayerId) {
    const beforeIndex = layers.findIndex((layer) => layer.id === beforeLayerId)
    if (beforeIndex !== -1) {
      return beforeIndex
    }
  }

  if (!parentGroupId) {
    return layers.length
  }

  const childIds = layers
    .filter((layer) => layer.parentGroupId === parentGroupId)
    .map((layer) => layer.id)

  if (childIds.length === 0) {
    const parentIndex = layers.findIndex((layer) => layer.id === parentGroupId)
    return parentIndex === -1 ? layers.length : parentIndex + 1
  }

  const lastChildId = childIds[childIds.length - 1]
  if (!lastChildId) {
    return layers.length
  }

  return getIndexAfterSubtree(layers, lastChildId)
}

function moveLayerBlock(
  layers: EditorLayer[],
  id: string,
  parentGroupId: string | null,
  beforeLayerId: string | null
): EditorLayer[] {
  const movingLayer = layers.find((layer) => layer.id === id)
  if (!movingLayer) {
    return layers
  }

  const validatedParentGroupId = getValidatedParentGroupId(
    layers,
    id,
    parentGroupId
  )
  const movingIds = new Set(getSubtreeLayerIds(layers, id))
  const movingBlock = layers.filter((layer) => movingIds.has(layer.id))
  const remainingLayers = layers.filter((layer) => !movingIds.has(layer.id))
  const safeBeforeLayerId =
    beforeLayerId && !movingIds.has(beforeLayerId) ? beforeLayerId : null
  const insertIndex = getContainerInsertIndex(
    remainingLayers,
    validatedParentGroupId,
    safeBeforeLayerId
  )
  const nextBlock = movingBlock.map((layer, index) =>
    index === 0 ? { ...layer, parentGroupId: validatedParentGroupId } : layer
  )
  const nextLayers = [...remainingLayers]

  nextLayers.splice(insertIndex, 0, ...nextBlock)

  return nextLayers
}

export const useLayerStore = create<LayerStore>((set, get) => ({
  hoveredLayerId: null,
  layers: normalizeLayers(getDefaultProjectLayers()),
  selectedLayerIds: DEFAULT_SELECTED_LAYER_ID
    ? [DEFAULT_SELECTED_LAYER_ID]
    : [],
  selectedLayerId: DEFAULT_SELECTED_LAYER_ID,
  selectionAnchorId: DEFAULT_SELECTED_LAYER_ID,

  addLayer: (type, insertIndex, parentGroupId = null) => {
    const existingLayers = get().layers
    const nextLayer = createLayer(type, countLayersOfType(existingLayers, type))
    nextLayer.parentGroupId = getValidatedParentGroupId(
      existingLayers,
      nextLayer.id,
      parentGroupId
    )

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
        layers: normalizeLayers(layers),
        selectedLayerIds: [nextLayer.id],
        selectedLayerId: nextLayer.id,
        selectionAnchorId: nextLayer.id,
      }
    })

    useEditorStore.getState().dismissStartupPreview()

    return nextLayer.id
  },

  createGroup: (insertIndex) => {
    const existingLayers = get().layers
    const nextGroup = createLayer(
      "group",
      countLayersOfType(existingLayers, "group")
    )

    set((state) => {
      const layers = [...state.layers]

      if (
        insertIndex === undefined ||
        insertIndex < 0 ||
        insertIndex > layers.length
      ) {
        layers.unshift(nextGroup)
      } else {
        layers.splice(insertIndex, 0, nextGroup)
      }

      return {
        layers: normalizeLayers(layers),
        selectedLayerIds: [nextGroup.id],
        selectedLayerId: nextGroup.id,
        selectionAnchorId: nextGroup.id,
      }
    })

    useEditorStore.getState().dismissStartupPreview()

    return nextGroup.id
  },

  removeLayer: (id) => {
    get().removeLayers([id])
  },

  removeLayers: (ids) => {
    const idsToRemove = getSelectionIdsForRemoval(get().layers, ids)
    const idSet = new Set(idsToRemove)

    if (idSet.size === 0) {
      return
    }

    let nextLayersSnapshot: EditorLayer[] | null = null

    set((state) => {
      const removedIndices = state.layers.flatMap((layer, index) =>
        idSet.has(layer.id) ? [index] : []
      )

      if (removedIndices.length === 0) {
        return state
      }

      const layers = state.layers.filter((layer) => !idSet.has(layer.id))
      nextLayersSnapshot = layers
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

    if (nextLayersSnapshot) {
      useTimelineStore.getState().pruneTracks(nextLayersSnapshot)
    }
  },

  duplicateLayer: (id) => {
    const sourceLayer = get().layers.find((layer) => layer.id === id)

    if (!sourceLayer) {
      return null
    }

    const duplicatedLayer = cloneLayer(sourceLayer)

    set((state) => {
      const sourceIndex = getIndexAfterSubtree(state.layers, id)
      const layers = [...state.layers]

      layers.splice(sourceIndex, 0, duplicatedLayer)

      return {
        layers: normalizeLayers(layers),
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

  moveLayerBefore: (id, targetId) => {
    if (id === targetId) {
      return
    }

    set((state) => {
      const targetLayer = state.layers.find((layer) => layer.id === targetId)
      if (!targetLayer) {
        return state
      }

      const layers = moveLayerBlock(
        state.layers,
        id,
        targetLayer.parentGroupId ?? null,
        targetId
      )

      return layers === state.layers ? state : { layers: normalizeLayers(layers) }
    })
  },

  moveLayerAfter: (id, targetId) => {
    if (id === targetId) {
      return
    }

    set((state) => {
      const targetLayer = state.layers.find((layer) => layer.id === targetId)
      if (!targetLayer) {
        return state
      }

      const movingIds = new Set(getSubtreeLayerIds(state.layers, id))
      const nextLayersWithoutMove = state.layers.filter(
        (layer) => !movingIds.has(layer.id)
      )
      const targetIndex = nextLayersWithoutMove.findIndex(
        (layer) => layer.id === targetId
      )
      const nextSibling = nextLayersWithoutMove
        .slice(targetIndex + 1)
        .find(
          (layer) => (layer.parentGroupId ?? null) === (targetLayer.parentGroupId ?? null)
        )
      const layers = moveLayerBlock(
        state.layers,
        id,
        targetLayer.parentGroupId ?? null,
        nextSibling?.id ?? null
      )

      return layers === state.layers ? state : { layers: normalizeLayers(layers) }
    })
  },

  moveLayerIntoGroup: (id, groupId, beforeLayerId = null) => {
    set((state) => {
      const groupLayer = state.layers.find((layer) => layer.id === groupId)
      if (!(groupLayer && isGroupLayer(groupLayer))) {
        return state
      }

      const layers = moveLayerBlock(state.layers, id, groupId, beforeLayerId)
      return layers === state.layers ? state : { layers: normalizeLayers(layers) }
    })
  },

  moveLayerToRoot: (id, beforeLayerId = null) => {
    set((state) => {
      const layers = moveLayerBlock(state.layers, id, null, beforeLayerId)
      return layers === state.layers ? state : { layers: normalizeLayers(layers) }
    })
  },

  ungroupLayer: (id) => {
    let nextLayersSnapshot: EditorLayer[] | null = null

    set((state) => {
      const groupLayer = state.layers.find((layer) => layer.id === id)
      if (!(groupLayer && isGroupLayer(groupLayer))) {
        return state
      }

      const firstChildId =
        state.layers.find((layer) => layer.parentGroupId === id)?.id ?? null

      const layers = state.layers
        .filter((layer) => layer.id !== id)
        .map((layer) =>
          layer.parentGroupId === id
            ? { ...layer, parentGroupId: groupLayer.parentGroupId ?? null }
            : layer
        )

      nextLayersSnapshot = layers

      return {
        layers: normalizeLayers(layers),
        selectedLayerIds: firstChildId ? [firstChildId] : [],
        selectedLayerId: firstChildId,
        selectionAnchorId: firstChildId,
      }
    })

    if (nextLayersSnapshot) {
      useTimelineStore.getState().pruneTracks(nextLayersSnapshot)
    }
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
        layer.id === id && !isGroupLayer(layer)
          ? { ...layer, assetId, runtimeError: null }
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
      layers: normalizeLayers(layers),
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

  getLayerDescendantIds: (id) => {
    return getDescendantLayerIds(get().layers, id)
  },

  getRenderableLayers: () => {
    return get().layers
  },
}))
