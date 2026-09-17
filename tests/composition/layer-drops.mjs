import {
  applyEditorHistorySnapshot,
  buildEditorHistorySnapshot,
} from "@/lib/editor/history"
import { dropLayer } from "@/lib/editor/layer-groups"
import { createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { useHistoryStore } from "@/store/history-store"
import { useLayerStore } from "@/store/layer-store"

function assert(value, message) {
  if (!value) throw new Error(message)
}
function layer(id, type = "text", parentId = null) {
  return { ...createLayer(type), id, name: id, parentId }
}
function order(layers) {
  return layers
    .map((entry) => `${entry.id}:${entry.parentId ?? "scene"}`)
    .join(",")
}

export function checkLayerDrops() {
  const a = layer("A", "group")
  const b = { ...layer("B", "group"), expanded: false }
  const child = layer("child", "text", a.id)
  const outside = layer("outside")
  const initial = [a, child, b, outside]
  const into = dropLayer(initial, child.id, { id: b.id, placement: "inside" })
  assert(
    order(into) === "A:scene,B:scene,child:B,outside:scene",
    "Drop into collapsed group failed"
  )
  assert(
    into.find((entry) => entry.id === b.id).expanded,
    "Destination stayed collapsed"
  )
  const out = dropLayer(into, child.id, { id: a.id, placement: "after" })
  assert(
    order(out) === "A:scene,child:scene,B:scene,outside:scene",
    "Drop out did not update parent/order"
  )
  const before = dropLayer(initial, outside.id, {
    id: child.id,
    placement: "before",
  })
  assert(
    order(before) === "A:scene,outside:A,child:A,B:scene",
    "Drop before a child did not enter its group"
  )
  const after = dropLayer(before, outside.id, {
    id: child.id,
    placement: "after",
  })
  assert(
    order(after) === "A:scene,child:A,outside:A,B:scene",
    "Sibling reorder failed"
  )
  const movedGroup = dropLayer(initial, a.id, { id: b.id, placement: "inside" })
  assert(
    order(movedGroup) === "B:scene,A:B,child:A,outside:scene",
    "Group drop lost subtree"
  )
  assert(
    dropLayer(initial, a.id, { id: child.id, placement: "inside" }) === null,
    "Cycle accepted"
  )
  assert(
    dropLayer(initial, a.id, { id: child.id, placement: "after" }) === null,
    "Drop beside own descendant accepted"
  )
  assert(
    dropLayer(initial, child.id, { id: outside.id, placement: "inside" }) ===
      null,
    "Source accepted children"
  )
  assert(
    dropLayer(initial, b.id, { id: a.id, placement: "after" }) === initial,
    "No-op created a new state"
  )
  assert(
    dropLayer([{ ...a, locked: true }, child, b], a.id, {
      id: b.id,
      placement: "inside",
    }) === null,
    "Locked source moved"
  )
  assert(
    dropLayer([a, child, { ...b, locked: true }], child.id, {
      id: b.id,
      placement: "inside",
    }) === null,
    "Locked destination accepted a drop"
  )
  const chain = Array.from({ length: 8 }, (_, i) =>
    layer(`depth-${i}`, "group", i ? `depth-${i - 1}` : null)
  )
  assert(
    dropLayer([...chain, a, child], a.id, {
      id: "depth-7",
      placement: "inside",
    }) === null,
    "Drop exceeded group depth limit"
  )

  const store = () => useLayerStore.getState()
  store().replaceState(initial, child.id)
  const beforeDrop = buildEditorHistorySnapshot()
  let mutations = 0
  const unsubscribe = useLayerStore.subscribe((next, previous) => {
    if (next.layers !== previous.layers) mutations++
  })
  store().dropLayer(child.id, { id: b.id, placement: "inside" })
  unsubscribe()
  assert(
    mutations === 1,
    "Drop must commit hierarchy/order in one store mutation"
  )
  assert(
    order(store().layers) === order(into),
    "Store did not commit intended drop"
  )
  assert(store().selectedLayerId === child.id, "Drop changed the selection")
  useHistoryStore.getState().clearHistory()
  useHistoryStore.getState().pushSnapshot("Move layer", beforeDrop)
  applyEditorHistorySnapshot(
    useHistoryStore.getState().undo(buildEditorHistorySnapshot())
  )
  assert(
    order(store().layers) === order(initial),
    "Undo did not restore membership/order"
  )
  applyEditorHistorySnapshot(
    useHistoryStore.getState().redo(buildEditorHistorySnapshot())
  )
  assert(order(store().layers) === order(into), "Redo did not restore drop")
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(
    parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))),
    []
  )
  assert(
    order(store().layers) === order(into),
    "Real hydration lost dropped membership/order"
  )
  assert(
    store().getLayerById(b.id).expanded,
    "Real hydration lost destination expansion"
  )
}
