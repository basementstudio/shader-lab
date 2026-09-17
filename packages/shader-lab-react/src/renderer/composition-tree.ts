/** Internal render tree; editor persistence and public shader configs remain flat. */
export interface CompositionGroup<Layer> {
  blendMode: string
  children: CompositionNode<Layer>[]
  id: string
  kind: "group"
  opacity: number
  visible: boolean
}

export type CompositionNode<Layer> = Layer | CompositionGroup<Layer>

export const MAX_COMPOSITION_GROUP_DEPTH = 8

export function isCompositionGroup<Layer>(
  node: CompositionNode<Layer>
): node is CompositionGroup<Layer> {
  return (
    typeof node === "object" &&
    node !== null &&
    "kind" in node &&
    node.kind === "group"
  )
}

/** Validate the entire tree before changing live passes. IDs are globally unique. */
export function flattenComposition<Layer>(
  nodes: CompositionNode<Layer>[],
  getLayerId: (layer: Layer) => string
): CompositionNode<Layer>[] {
  const result: CompositionNode<Layer>[] = []
  const ids = new Set<string>()
  function visit(entries: CompositionNode<Layer>[], depth: number): void {
    for (const entry of entries) {
      const group = isCompositionGroup(entry)
      const id = group ? entry.id : getLayerId(entry)
      if (ids.has(id)) throw new Error(`Duplicate composition ID: ${id}`)
      ids.add(id)
      result.push(entry)
      if (group) {
        if (depth >= MAX_COMPOSITION_GROUP_DEPTH) {
          throw new Error(
            `Composition groups support at most ${MAX_COMPOSITION_GROUP_DEPTH} levels`
          )
        }
        visit(entry.children, depth + 1)
      }
    }
  }
  visit(nodes, 0)
  return result
}

/** Frames use sidebar order (top first); pipelines paint bottom first at every level. */
export function reverseComposition<Layer>(
  nodes: CompositionNode<Layer>[],
  depth = 0
): CompositionNode<Layer>[] {
  if (depth > MAX_COMPOSITION_GROUP_DEPTH) {
    throw new Error(
      `Composition groups support at most ${MAX_COMPOSITION_GROUP_DEPTH} levels`
    )
  }
  return [...nodes]
    .reverse()
    .map((node) =>
      isCompositionGroup(node)
        ? { ...node, children: reverseComposition(node.children, depth + 1) }
        : node
    )
}
