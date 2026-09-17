"use client"

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react"
import { dropLayer, type LayerDropTarget } from "@/lib/editor/layer-groups"
import { useLayerStore } from "@/store/layer-store"
import type { EditorLayer } from "@/types/editor"

type DragPreview = {
  id: string
  target: LayerDropTarget | null
  message: string
}

function findTarget(
  root: HTMLElement,
  layers: EditorLayer[],
  x: number,
  y: number
): LayerDropTarget | null {
  const bounds = root.getBoundingClientRect()
  if (
    x < bounds.left ||
    x > bounds.right ||
    y < bounds.top ||
    y > bounds.bottom
  )
    return null
  const rows = Array.from(
    root.querySelectorAll<HTMLElement>("[data-layer-row]")
  )
  const row =
    rows.find((entry) => y <= entry.getBoundingClientRect().bottom) ??
    rows.at(-1)
  if (!row) return null
  const rect = row.getBoundingClientRect()
  let anchor = layers.find((layer) => layer.id === row.dataset.layerRow)
  if (!anchor) return null
  let placement: LayerDropTarget["placement"] =
    y < rect.top + rect.height / 2 ? "before" : "after"
  if (
    anchor.kind === "group" &&
    x >= rect.left &&
    y > rect.top + rect.height * 0.25 &&
    y < rect.bottom - rect.height * 0.25
  )
    placement = "inside"
  // The left gutter selects an ancestor's level, allowing a child to leave
  // even a group that is the scene's only root item.
  if (placement !== "inside") {
    let left = rect.left
    while (anchor.parentId && x < left - 4) {
      const parent = layers.find((layer) => layer.id === anchor?.parentId)
      const parentRow = rows.find(
        (entry) => entry.dataset.layerRow === parent?.id
      )
      if (!(parent && parentRow)) break
      anchor = parent
      left = parentRow.getBoundingClientRect().left
    }
  }
  return { id: anchor.id, placement }
}

/** Keep the tree still during a drag; the indicator is the proposed destination. */
export function useLayerDrag() {
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])

  function start(id: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary || cleanup.current) return
    const handle = event.currentTarget
    const root = handle.closest<HTMLElement>("[data-layer-tree-root]")
    const layers = useLayerStore.getState().layers
    const source = layers.find((layer) => layer.id === id)
    if (!(root && source) || source.locked) return
    event.preventDefault()
    event.stopPropagation()
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    let x = startX
    let y = startY
    let active = false
    let target: LayerDropTarget | null = null
    let frame = 0
    let lastTime = 0
    handle.setPointerCapture(pointerId)

    const update = () => {
      if (
        useLayerStore.getState().layers !== layers ||
        !root.isConnected ||
        root.getBoundingClientRect().width === 0
      ) {
        cancel()
        return
      }
      const candidate = findTarget(root, layers, x, y)
      target = candidate && dropLayer(layers, id, candidate) ? candidate : null
      const anchor = layers.find((layer) => layer.id === target?.id)
      const parent = layers.find((layer) => layer.id === anchor?.parentId)
      let message = `Cannot drop ${source.name} here. Escape to cancel.`
      if (target && anchor)
        message =
          target.placement === "inside"
            ? `Move ${source.name} into ${anchor.name}`
            : `Move ${source.name} ${target.placement} ${anchor.name} · ${parent?.name ?? "Scene"}`
      const destination = target
      setPreview((previous) =>
        previous?.id === id &&
        previous.message === message &&
        previous.target?.id === destination?.id &&
        previous.target?.placement === destination?.placement
          ? previous
          : { id, target: destination, message }
      )
    }
    const tick = (time: number) => {
      const bounds = root.getBoundingClientRect()
      const elapsed = Math.min(time - (lastTime || time), 32)
      lastTime = time
      if (
        x >= bounds.left &&
        x <= bounds.right &&
        y >= bounds.top &&
        y <= bounds.bottom
      ) {
        const edge = 32
        const speed = Math.max(
          -1,
          Math.min(1, (y - (bounds.bottom - edge)) / edge)
        )
        const upwards = Math.max(
          -1,
          Math.min(0, (y - bounds.top - edge) / edge)
        )
        root.scrollTop +=
          (upwards < 0 ? upwards : Math.max(0, speed)) * elapsed * 0.45
      }
      update()
      if (cleanup.current) frame = requestAnimationFrame(tick)
    }
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      x = next.clientX
      y = next.clientY
      if (!active && Math.hypot(x - startX, y - startY) < 5) return
      if (!active) {
        active = true
        frame = requestAnimationFrame(tick)
      }
      next.preventDefault()
      update()
    }
    const finish = () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", cancelPointer)
      window.removeEventListener("keydown", key, true)
      window.removeEventListener("blur", cancel)
      handle.removeEventListener("lostpointercapture", cancel)
      cleanup.current = null
      if (handle.hasPointerCapture(pointerId))
        handle.releasePointerCapture(pointerId)
      setPreview(null)
    }
    const cancel = () => {
      target = null
      active = false
      finish()
    }
    const cancelPointer = (next: PointerEvent) => {
      if (next.pointerId === pointerId) cancel()
    }
    const key = (next: KeyboardEvent) => {
      if (next.key === "Escape") {
        next.preventDefault()
        next.stopPropagation()
        cancel()
      }
    }
    const end = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      x = next.clientX
      y = next.clientY
      if (active) update()
      const destination = target
      finish()
      if (active && destination && useLayerStore.getState().layers === layers)
        useLayerStore.getState().dropLayer(id, destination)
    }
    cleanup.current = finish
    window.addEventListener("pointermove", move, { passive: false })
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", cancelPointer)
    window.addEventListener("keydown", key, true)
    window.addEventListener("blur", cancel)
    handle.addEventListener("lostpointercapture", cancel)
  }

  return { preview, start }
}
