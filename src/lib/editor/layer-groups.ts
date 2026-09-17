import { validateLayerHierarchy } from "@/renderer/layer-hierarchy"
import type { EditorLayer } from "@/types/editor"

export function subtreeLayers(
  layers: readonly EditorLayer[],
  id: string
): EditorLayer[] {
  const ids = new Set([id])
  return layers.filter((layer) => {
    if (layer.parentId && ids.has(layer.parentId)) ids.add(layer.id)
    return ids.has(layer.id)
  })
}

export function selectionRoots(
  layers: readonly EditorLayer[],
  ids: readonly string[]
): EditorLayer[] {
  const selected = new Set(ids)
  const covered = new Set<string>()
  return layers.filter((layer) => {
    if (layer.parentId && covered.has(layer.parentId)) {
      covered.add(layer.id)
      return false
    }
    if (!selected.has(layer.id)) return false
    covered.add(layer.id)
    return true
  })
}

export function visibleLayerRows(
  layers: readonly EditorLayer[]
): EditorLayer[] {
  const collapsed = new Set<string>()
  return layers.filter((layer) => {
    if (layer.parentId && collapsed.has(layer.parentId)) {
      collapsed.add(layer.id)
      return false
    }
    if (layer.kind === "group" && !layer.expanded) collapsed.add(layer.id)
    return true
  })
}

/** Reorder complete sibling subtrees, retaining every child's relative order. */
export function reorderSiblingLayers(
  layers: EditorLayer[],
  parentId: string | null,
  ids: string[]
): EditorLayer[] {
  const siblings = layers.filter(
    (layer) => (layer.parentId ?? null) === parentId
  )
  if (
    siblings.length !== ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !siblings.some((layer) => layer.id === id))
  )
    return layers
  const entries = new Map(
    siblings.map((layer) => [layer.id, subtreeLayers(layers, layer.id)])
  )
  const ordered = ids.flatMap((id) => entries.get(id)!)
  if (parentId === null) return ordered
  const start = layers.findIndex((layer) => layer.id === parentId) + 1
  return [
    ...layers.slice(0, start),
    ...ordered,
    ...layers.slice(start + ordered.length),
  ]
}

export function groupingSelection(
  layers: EditorLayer[],
  ids: readonly string[]
): EditorLayer[] {
  const roots = selectionRoots(layers, ids)
  if (
    !roots.length ||
    roots.some(
      (layer) =>
        layer.locked ||
        (layer.parentId ?? null) !== (roots[0]!.parentId ?? null)
    )
  )
    return []
  return roots
}

export function insertGroup(
  layers: EditorLayer[],
  ids: readonly string[],
  group: EditorLayer
): EditorLayer[] | null {
  const roots = groupingSelection(layers, ids)
  if (!roots.length) return null
  const rootIds = new Set(roots.map((layer) => layer.id))
  const contents = roots.flatMap((layer) => subtreeLayers(layers, layer.id))
  const contentIds = new Set(contents.map((layer) => layer.id))
  const remaining = layers.filter((layer) => !contentIds.has(layer.id))
  const index = layers.indexOf(roots[0]!)
  const next = [
    ...remaining.slice(0, index),
    { ...group, parentId: roots[0]!.parentId ?? null },
    ...contents.map((layer) =>
      rootIds.has(layer.id) ? { ...layer, parentId: group.id } : layer
    ),
    ...remaining.slice(index),
  ]
  try {
    validateLayerHierarchy(next)
  } catch {
    return null
  }
  return next
}

export function moveLayerToGroup(
  layers: EditorLayer[],
  id: string,
  parentId: string | null
): EditorLayer[] | null {
  const source = layers.find((layer) => layer.id === id)
  const parent = layers.find((layer) => layer.id === parentId)
  if (
    !source ||
    source.locked ||
    (parentId !== null && (!parent || parent.kind !== "group" || parent.locked))
  )
    return null
  if ((source.parentId ?? null) === parentId) return layers
  const contents = subtreeLayers(layers, id)
  if (contents.some((layer) => layer.id === parentId)) return null
  const ids = new Set(contents.map((layer) => layer.id))
  const remaining = layers.filter((layer) => !ids.has(layer.id))
  const index =
    parentId === null
      ? 0
      : remaining.findIndex((layer) => layer.id === parentId) + 1
  const next = [
    ...remaining.slice(0, index),
    { ...source, parentId },
    ...contents.slice(1),
    ...remaining.slice(index),
  ].map((layer) =>
    layer.id === parentId ? { ...layer, expanded: true } : layer
  )
  try {
    validateLayerHierarchy(next)
  } catch {
    return null
  }
  return next
}
