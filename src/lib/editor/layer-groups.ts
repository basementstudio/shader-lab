import type { EditorLayer, GroupLayer } from "@/types/editor"

export type LayerTreeRow = {
  depth: number
  hasChildren: boolean
  layer: EditorLayer
  parentGroupId: string | null
}

function getGroupIdSet(layers: readonly EditorLayer[]): Set<string> {
  return new Set(
    layers.filter((layer) => isGroupLayer(layer)).map((layer) => layer.id)
  )
}

export function isGroupLayer(layer: EditorLayer): layer is GroupLayer {
  return layer.kind === "group" && layer.type === "group"
}

export function normalizeParentGroupId(
  layer: Pick<EditorLayer, "id" | "parentGroupId">,
  groupIds: ReadonlySet<string>
): string | null {
  if (!(layer.parentGroupId && groupIds.has(layer.parentGroupId))) {
    return null
  }

  if (layer.parentGroupId === layer.id) {
    return null
  }

  return layer.parentGroupId
}

export function getNormalizedParentGroupIdMap(
  layers: readonly EditorLayer[]
): Map<string, string | null> {
  const groupIds = getGroupIdSet(layers)

  return new Map(
    layers.map((layer) => [layer.id, normalizeParentGroupId(layer, groupIds)])
  )
}

export function getChildLayers(
  layers: readonly EditorLayer[],
  parentGroupId: string | null
): EditorLayer[] {
  const parentMap = getNormalizedParentGroupIdMap(layers)

  return layers.filter((layer) => (parentMap.get(layer.id) ?? null) === parentGroupId)
}

export function getChildLayerIds(
  layers: readonly EditorLayer[],
  parentGroupId: string | null
): string[] {
  return getChildLayers(layers, parentGroupId).map((layer) => layer.id)
}

export function getDescendantLayerIds(
  layers: readonly EditorLayer[],
  layerId: string
): string[] {
  const children = getChildLayers(layers, layerId)
  const descendants: string[] = []

  for (const child of children) {
    descendants.push(child.id, ...getDescendantLayerIds(layers, child.id))
  }

  return descendants
}

export function getSubtreeLayerIds(
  layers: readonly EditorLayer[],
  layerId: string
): string[] {
  return [layerId, ...getDescendantLayerIds(layers, layerId)]
}

export function getIndexAfterSubtree(
  layers: readonly EditorLayer[],
  layerId: string
): number {
  const subtreeIds = new Set(getSubtreeLayerIds(layers, layerId))
  let lastIndex = -1

  for (const [index, layer] of layers.entries()) {
    if (subtreeIds.has(layer.id)) {
      lastIndex = index
    }
  }

  return lastIndex + 1
}

export function isDescendantLayer(
  layers: readonly EditorLayer[],
  layerId: string,
  ancestorId: string
): boolean {
  return getDescendantLayerIds(layers, ancestorId).includes(layerId)
}

export function getLayerRows(layers: readonly EditorLayer[]): LayerTreeRow[] {
  const parentMap = getNormalizedParentGroupIdMap(layers)
  const rows: LayerTreeRow[] = []

  const visit = (parentGroupId: string | null, depth: number) => {
    for (const layer of layers) {
      const normalizedParentGroupId = parentMap.get(layer.id) ?? null
      if (normalizedParentGroupId !== parentGroupId) {
        continue
      }

      const childIds = getChildLayerIds(layers, layer.id)
      rows.push({
        depth,
        hasChildren: childIds.length > 0,
        layer,
        parentGroupId: normalizedParentGroupId,
      })

      if (isGroupLayer(layer) && layer.expanded && childIds.length > 0) {
        visit(layer.id, depth + 1)
      }
    }
  }

  visit(null, 0)

  return rows
}

export function getInsertIndexForNewLayer(
  layers: readonly EditorLayer[],
  parentGroupId: string | null
): number {
  if (!parentGroupId) {
    return 0
  }

  const groupIndex = layers.findIndex((layer) => layer.id === parentGroupId)
  if (groupIndex === -1) {
    return 0
  }

  return groupIndex + 1
}

export function getGroupIdForContextInsertion(
  layers: readonly EditorLayer[],
  selectedLayerId: string | null
): string | null {
  if (!selectedLayerId) {
    return null
  }

  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId)
  if (!selectedLayer) {
    return null
  }

  if (isGroupLayer(selectedLayer)) {
    return selectedLayer.id
  }

  return selectedLayer.parentGroupId ?? null
}
