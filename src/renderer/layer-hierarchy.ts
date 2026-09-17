import {
  type CompositionNode,
  MAX_COMPOSITION_GROUP_DEPTH,
} from "./composition-tree"

export interface HierarchyLayer {
  id: string
  kind: string
  parentId?: string | null | undefined
}

/** A flat, top-first preorder keeps subtrees contiguous for selection and moves. */
export function validateLayerHierarchy(
  layers: readonly HierarchyLayer[]
): void {
  const ids = new Set<string>()
  const ancestors: string[] = []
  for (const layer of layers) {
    if (ids.has(layer.id)) throw new Error(`Duplicate layer ID: ${layer.id}`)
    ids.add(layer.id)
    const parent = layer.parentId ?? null
    while (ancestors.length && ancestors.at(-1) !== parent) ancestors.pop()
    if (parent !== null && ancestors.at(-1) !== parent) {
      throw new Error("Group children must follow their parent in layer order.")
    }
    if (layer.kind === "group") {
      if (ancestors.length >= MAX_COMPOSITION_GROUP_DEPTH) {
        throw new Error(
          `Groups support at most ${MAX_COMPOSITION_GROUP_DEPTH} levels.`
        )
      }
      ancestors.push(layer.id)
    }
  }
}

export function buildCompositionTree<
  Layer extends HierarchyLayer & {
    blendMode: string
    opacity: number
    visible: boolean
  },
  Leaf,
>(layers: Layer[], leaf: (layer: Layer) => Leaf): CompositionNode<Leaf>[] {
  validateLayerHierarchy(layers)
  const root: CompositionNode<Leaf>[] = []
  const children = new Map<string, CompositionNode<Leaf>[]>()
  const hidden = new Set<string>()
  for (const layer of layers) {
    if (!layer.visible || (layer.parentId && hidden.has(layer.parentId))) {
      hidden.add(layer.id)
      continue
    }
    const target = layer.parentId ? children.get(layer.parentId)! : root
    if (layer.kind === "group") {
      const nested: CompositionNode<Leaf>[] = []
      target.push({
        id: layer.id,
        kind: "group",
        blendMode: layer.blendMode,
        opacity: layer.opacity,
        visible: true,
        children: nested,
      })
      children.set(layer.id, nested)
    } else {
      target.push(leaf(layer))
    }
  }
  return root
}
