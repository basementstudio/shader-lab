"use client"
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { useEditorStore } from "@/store/editor-store"

export type Geometry = {
  center: [number, number]
  size: [number, number]
  rotation: number
}
export type GeometryOutline = "ellipse" | "rectangle" | "radial" | "linear" | "none"
type Handle = "center" | "x" | "y" | "start" | "end"
type Drag = {
  pointer: number
  handle: Handle
  original: Geometry
  offset: [number, number]
}

export function GeometryHandles({
  geometry,
  outline,
  panning,
  read,
  write,
  restore,
  dataPrefix,
  label,
}: {
  geometry: Geometry
  outline: GeometryOutline
  panning: boolean
  read: () => Geometry
  write: (updates: Partial<Geometry>) => void
  restore: (original: Geometry) => void
  dataPrefix: string
  label: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [box, setBox] = useState({ width: 1, height: 1 })
  useEffect(() => {
    const element = host.current
    if (!element) return
    const update = () =>
      setBox({
        width: Math.max(1, element.clientWidth),
        height: Math.max(1, element.clientHeight),
      })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const shorter = Math.min(box.width, box.height)
  const toPx = (x: number, y: number): [number, number] => [
    x * shorter + box.width / 2,
    y * shorter + box.height / 2,
  ]
  const fromEvent = (event: ReactPointerEvent<Element>): [number, number] => {
    const rect = host.current!.getBoundingClientRect()
    const scale = rect.width / box.width
    const s = Math.max(1e-6, shorter * scale)
    return [
      (event.clientX - rect.left - rect.width / 2) / s,
      (event.clientY - rect.top - rect.height / 2) / s,
    ]
  }
  const angle = (geometry.rotation * Math.PI) / 180
  const dir: [number, number] = [Math.cos(angle), Math.sin(angle)]
  const perp: [number, number] = [-Math.sin(angle), Math.cos(angle)]
  const [cx, cy] = geometry.center
  const half: [number, number] = [geometry.size[0] / 2, geometry.size[1] / 2]
  const xHandle: [number, number] = [cx + dir[0] * half[0], cy + dir[1] * half[0]]
  const yHandle: [number, number] = [cx + perp[0] * half[1], cy + perp[1] * half[1]]
  const start: [number, number] = [cx - dir[0] * half[0], cy - dir[1] * half[0]]
  const end = xHandle
  const finish = useCallback(
    (commit: boolean) => {
      const active = drag.current
      if (!active) return
      drag.current = null
      if (!commit) restore(active.original)
      useEditorStore.getState().endInteractiveEdit()
    },
    [restore]
  )
  useEffect(() => {
    const cancel = () => finish(false)
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) cancel()
    }
    window.addEventListener("blur", cancel)
    window.addEventListener("keydown", key)
    return () => {
      finish(false)
      window.removeEventListener("blur", cancel)
      window.removeEventListener("keydown", key)
    }
  }, [finish])
  const begin = (handle: Handle) => (event: ReactPointerEvent<Element>) => {
    if (panning || event.button !== 0 || drag.current) return
    event.preventDefault()
    event.stopPropagation()
    const point = fromEvent(event)
    drag.current = {
      pointer: event.pointerId,
      handle,
      original: structuredClone(read()),
      offset: [point[0] - cx, point[1] - cy],
    }
    useEditorStore.getState().beginInteractiveEdit()
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }
  const move = (event: ReactPointerEvent<Element>) => {
    const active = drag.current
    if (!active || event.pointerId !== active.pointer) return
    event.stopPropagation()
    const point = fromEvent(event)
    const current = read()
    const [ccx, ccy] = current.center
    const dx = point[0] - ccx
    const dy = point[1] - ccy
    const clampSize = (v: number) => Math.min(8, Math.max(0.01, v))
    const degrees = (radians: number) =>
      Math.round(((radians * 180) / Math.PI) * 10) / 10
    switch (active.handle) {
      case "center":
        write({
          center: [point[0] - active.offset[0], point[1] - active.offset[1]],
        })
        break
      case "x":
        write({
          rotation: degrees(Math.atan2(dy, dx)),
          size: [clampSize(2 * Math.hypot(dx, dy)), current.size[1]],
        })
        break
      case "y": {
        const a = (current.rotation * Math.PI) / 180
        const projection = -dx * Math.sin(a) + dy * Math.cos(a)
        write({ size: [current.size[0], clampSize(2 * Math.abs(projection))] })
        break
      }
      case "start":
      case "end": {
        const a = (current.rotation * Math.PI) / 180
        const d: [number, number] = [Math.cos(a), Math.sin(a)]
        const otherSign = active.handle === "end" ? -1 : 1
        const other: [number, number] = [
          ccx + otherSign * d[0] * (current.size[0] / 2),
          ccy + otherSign * d[1] * (current.size[0] / 2),
        ]
        const vx = active.handle === "end" ? point[0] - other[0] : other[0] - point[0]
        const vy = active.handle === "end" ? point[1] - other[1] : other[1] - point[1]
        write({
          center: [(point[0] + other[0]) / 2, (point[1] + other[1]) / 2],
          rotation: degrees(Math.atan2(vy, vx)),
          size: [clampSize(Math.hypot(vx, vy)), current.size[1]],
        })
        break
      }
    }
  }
  const up = (event: ReactPointerEvent<Element>) => {
    if (event.pointerId !== drag.current?.pointer) return
    move(event)
    finish(true)
  }
  const cancelEvent = (event: ReactPointerEvent<Element>) => {
    if (event.pointerId === drag.current?.pointer) finish(false)
  }
  const [pcx, pcy] = toPx(cx, cy)
  const stroke = "rgba(255,255,255,0.9)"
  const handleProps = (handle: Handle) => ({
    r: 6,
    fill: "white",
    stroke: "black",
    strokeWidth: 1,
    style: { cursor: panning ? "inherit" : "grab", pointerEvents: "all" as const },
    onPointerDown: begin(handle),
    onPointerMove: move,
    onPointerUp: up,
    onPointerCancel: cancelEvent,
    onLostPointerCapture: cancelEvent,
    [`data-${dataPrefix}-handle`]: handle,
  })
  const isLinear = outline === "linear"
  const [sx, sy] = toPx(start[0], start[1])
  const [ex, ey] = toPx(end[0], end[1])
  const [xx, xy] = toPx(xHandle[0], xHandle[1])
  const [yx, yy] = toPx(yHandle[0], yHandle[1])
  return (
    <div
      ref={host}
      {...{ [`data-${dataPrefix}-handles`]: "true" }}
      className="pointer-events-none absolute inset-0 z-20"
    >
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-label={label}
        role="application"
        style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.9))" }}
      >
        {isLinear ? (
          <>
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={stroke} />
            <line
              x1={sx - perp[0] * 14}
              y1={sy - perp[1] * 14}
              x2={sx + perp[0] * 14}
              y2={sy + perp[1] * 14}
              stroke={stroke}
            />
            <line
              x1={ex - perp[0] * 14}
              y1={ey - perp[1] * 14}
              x2={ex + perp[0] * 14}
              y2={ey + perp[1] * 14}
              stroke={stroke}
              strokeDasharray="3 3"
            />
          </>
        ) : (
          <g transform={`translate(${pcx} ${pcy}) rotate(${geometry.rotation})`}>
            {outlineElement(outline, half, geometry.size, shorter, stroke)}
            <line x1={0} y1={0} x2={half[0] * shorter} y2={0} stroke={stroke} strokeOpacity={0.5} />
            <line x1={0} y1={0} x2={0} y2={half[1] * shorter} stroke={stroke} strokeOpacity={0.5} />
          </g>
        )}
        {isLinear ? (
          <>
            <circle cx={sx} cy={sy} {...handleProps("start")} />
            <circle cx={ex} cy={ey} {...handleProps("end")} />
            <circle cx={pcx} cy={pcy} {...handleProps("center")} r={5} />
          </>
        ) : (
          <>
            <circle cx={xx} cy={xy} {...handleProps("x")} />
            <circle cx={yx} cy={yy} {...handleProps("y")} />
            <circle cx={pcx} cy={pcy} {...handleProps("center")} />
          </>
        )}
      </svg>
    </div>
  )
}

function outlineElement(
  outline: GeometryOutline,
  half: [number, number],
  size: [number, number],
  shorter: number,
  stroke: string
) {
  if (outline === "rectangle" || outline === "none") {
    return (
      <rect
        x={-half[0] * shorter}
        y={-half[1] * shorter}
        width={size[0] * shorter}
        height={size[1] * shorter}
        fill="none"
        stroke={stroke}
        strokeOpacity={outline === "none" ? 0.5 : 1}
        strokeDasharray={outline === "none" ? "4 4" : undefined}
      />
    )
  }
  return (
    <ellipse
      rx={half[0] * shorter}
      ry={half[1] * shorter}
      fill="none"
      stroke={stroke}
      strokeDasharray={outline === "radial" ? "4 4" : undefined}
    />
  )
}

export function isEditableLayerChain(
  layers: { id: string; parentId?: string | null; locked: boolean; visible: boolean }[],
  layer: { id: string; parentId?: string | null; locked: boolean; visible: boolean }
): boolean {
  let current: typeof layer | undefined = layer
  const visited = new Set<string>()
  while (current) {
    if (current.locked || !current.visible || visited.has(current.id))
      return false
    visited.add(current.id)
    current = layers.find((item) => item.id === current?.parentId)
  }
  return true
}
