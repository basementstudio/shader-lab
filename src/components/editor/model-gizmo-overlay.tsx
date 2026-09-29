"use client"
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { PerspectiveCamera, Vector3 } from "three"
import {
  configureModelCamera,
  eulerToQuaternion,
  modelCameraBasis,
  modelRadius,
  readModelFraming,
  rotateAboutAxis,
  trackballRotation,
  type Vec3,
} from "@/lib/editor/model-framing"
import { isEditableTarget } from "@/lib/editor/is-editable-target"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { type ModelGizmoMode, useModelGizmoStore } from "@/store/model-gizmo-store"
import type { EditorLayer, LayerParameterValues } from "@/types/editor"
import { isEditableLayerChain } from "./geometry-handles"

type Axis = 0 | 1 | 2
type Interaction =
  | { kind: "move"; axis: Axis | null }
  | { kind: "rotate"; axis: Axis | "view" | "trackball" }
  | { kind: "scale"; axis: Axis | null }
  | { kind: "orbit"; shift: boolean }
type Point = { x: number; y: number }
type Transform = {
  elevation: number
  location: Vec3
  orbit: number
  rotation: Vec3
  scale: Vec3
  shift: [number, number]
}
type Session = {
  angle: number
  interaction: Interaction
  modal: boolean
  origin: Point
  original: Transform
  pointer: number | null
  sweep: number
  view: View
}
type View = ReturnType<typeof buildView>

const AXIS_COLORS = ["#ff3352", "#8bdc00", "#2890ff"] as const
const AXIS_NAMES = ["X", "Y", "Z"] as const
const UNIT_AXES = [
  new Vector3(1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, 0, 1),
] as const
const CLEAR_KEYS: Record<string, { key: string; value: Vec3 }> = {
  KeyG: { key: "location", value: [0, 0, 0] },
  KeyR: { key: "rotation", value: [0, 0, 0] },
  KeyS: { key: "scale", value: [1, 1, 1] },
}
const GIZMO_PX = 72
const RING_SEGMENTS = 64

function selectModelLayer(state: {
  layers: EditorLayer[]
  selectedLayerId: string | null
}): EditorLayer | null {
  const layer = state.layers.find((entry) => entry.id === state.selectedLayerId)
  if (!layer || layer.type !== "model") return null
  return isEditableLayerChain(state.layers, layer) ? layer : null
}

function readTransform(params: LayerParameterValues): Transform {
  const framing = readModelFraming(params)
  return {
    elevation: framing.elevation,
    location: framing.location,
    orbit: framing.orbit,
    rotation: framing.rotation,
    scale: framing.scale,
    shift: framing.shift,
  }
}

function buildView(params: LayerParameterValues, width: number, height: number) {
  const framing = readModelFraming(params)
  const camera = new PerspectiveCamera()
  configureModelCamera(camera, framing, width, height)
  const pivot = new Vector3(...framing.location)
  const project = (world: Vector3): Point => {
    const ndc = world.clone().project(camera)
    return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height }
  }
  const toCamera = camera.position.clone().sub(pivot)
  const depth = Math.max(
    1e-3,
    toCamera.dot(camera.getWorldDirection(new Vector3()).negate())
  )
  const worldPerPixel =
    (2 * depth * Math.tan(((camera.fov * Math.PI) / 180) / 2)) / Math.max(1, height)
  const length = GIZMO_PX * worldPerPixel
  const orientation = eulerToQuaternion(framing.rotation)
  const localAxes = UNIT_AXES.map((axis) => axis.clone().applyQuaternion(orientation))
  return {
    basis: modelCameraBasis(framing.orbit, framing.elevation),
    bodyRadius: modelRadius(framing) / worldPerPixel,
    camera,
    center: project(pivot),
    length,
    localAxes,
    pivot,
    project,
    shorter: Math.min(width, height),
    toCamera: toCamera.normalize(),
    worldPerPixel,
  }
}

function axisScreen(view: View, axis: Vector3): { direction: Point; pixels: number } {
  const end = view.project(view.pivot.clone().addScaledVector(axis, view.length))
  const dx = end.x - view.center.x
  const dy = end.y - view.center.y
  const pixels = Math.hypot(dx, dy)
  return {
    direction: pixels > 1e-6 ? { x: dx / pixels, y: dy / pixels } : { x: 0, y: 0 },
    pixels,
  }
}

function ringPath(view: View, axis: Vector3): string {
  const helper = Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
  const u = helper.clone().cross(axis).normalize()
  const v = axis.clone().cross(u).normalize()
  const points: string[] = []
  for (let index = 0; index <= RING_SEGMENTS; index += 1) {
    const theta = (index / RING_SEGMENTS) * Math.PI * 2
    const world = view.pivot
      .clone()
      .addScaledVector(u, Math.cos(theta) * view.length)
      .addScaledVector(v, Math.sin(theta) * view.length)
    const point = view.project(world)
    points.push(`${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
  }
  return points.join(" ")
}

function screenAngle(view: View, point: Point): number {
  return Math.atan2(view.center.y - point.y, point.x - view.center.x)
}

function describe(session: Session): string {
  const { interaction } = session
  const axisLabel = (axis: unknown) =>
    typeof axis === "number" ? ` · ${AXIS_NAMES[axis as Axis]}` : ""
  switch (interaction.kind) {
    case "move":
      return `Move${axisLabel(interaction.axis)}`
    case "rotate":
      if (interaction.axis === "trackball") return "Rotate · Free"
      return `Rotate${interaction.axis === "view" ? " · View" : axisLabel(interaction.axis)}`
    case "scale":
      return `Scale${axisLabel(interaction.axis)}`
    default:
      return interaction.shift ? "Shift camera" : "Orbit camera"
  }
}

export function ModelGizmoOverlay({
  disabled,
  panning,
}: {
  disabled: boolean
  panning: boolean
}) {
  const layer = useLayerStore(selectModelLayer)
  const mode = useModelGizmoStore((state) => state.mode)
  const host = useRef<HTMLDivElement | null>(null)
  const [hostElement, setHostElement] = useState<HTMLDivElement | null>(null)
  const session = useRef<Session | null>(null)
  const lastPointer = useRef<Point | null>(null)
  const [box, setBox] = useState({ height: 1, width: 1 })
  const [hud, setHud] = useState<string | null>(null)
  const layerId = layer?.id ?? null

  useEffect(() => {
    const element = hostElement
    if (!element) return
    const update = () =>
      setBox({
        height: Math.max(1, element.clientHeight),
        width: Math.max(1, element.clientWidth),
      })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hostElement])

  const view = useMemo(
    () => (layer ? buildView(layer.params, box.width, box.height) : null),
    [layer, box.height, box.width]
  )
  const viewRef = useRef(view)
  viewRef.current = view

  const toLocal = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const element = host.current
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const scale = rect.width / Math.max(1, element.clientWidth)
      return {
        x: (clientX - rect.left) / Math.max(1e-6, scale),
        y: (clientY - rect.top) / Math.max(1e-6, scale),
      }
    },
    []
  )

  const write = useCallback(
    (updates: Partial<Transform>) => {
      if (!layerId) return
      const store = useLayerStore.getState()
      for (const [key, value] of Object.entries(updates)) {
        store.updateLayerParam(layerId, key, value as never)
      }
    },
    [layerId]
  )

  const apply = useCallback(
    (active: Session, point: Point) => {
      const { interaction, original, origin, view: start } = active
      const dx = point.x - origin.x
      const dy = point.y - origin.y
      switch (interaction.kind) {
        case "move": {
          if (interaction.axis === null) {
            const offset = start.basis.right
              .clone()
              .multiplyScalar(dx * start.worldPerPixel)
              .addScaledVector(start.basis.up, -dy * start.worldPerPixel)
            write({
              location: original.location.map(
                (value, index) => value + offset.getComponent(index)
              ) as Vec3,
            })
            return
          }
          const axis = UNIT_AXES[interaction.axis]
          const screen = axisScreen(start, axis)
          if (screen.pixels < 1) return
          const amount =
            ((dx * screen.direction.x + dy * screen.direction.y) / screen.pixels) *
            start.length
          const location = [...original.location] as Vec3
          location[interaction.axis] += amount
          write({ location })
          return
        }
        case "rotate": {
          if (interaction.axis === "trackball") {
            write({
              rotation: trackballRotation(
                original.rotation,
                dx,
                dy,
                Math.max(GIZMO_PX * 2, start.bodyRadius * 2),
                start.basis
              ),
            })
            return
          }
          const angle = screenAngle(start, point)
          let step = angle - active.angle
          if (step > Math.PI) step -= Math.PI * 2
          if (step < -Math.PI) step += Math.PI * 2
          active.angle = angle
          active.sweep += step
          const axis =
            interaction.axis === "view" ? start.toCamera : UNIT_AXES[interaction.axis]
          const facing = axis.dot(start.toCamera) >= 0 ? 1 : -1
          write({
            rotation: rotateAboutAxis(original.rotation, axis, active.sweep * facing),
          })
          return
        }
        case "scale": {
          const from = { x: origin.x - start.center.x, y: origin.y - start.center.y }
          const to = { x: point.x - start.center.x, y: point.y - start.center.y }
          if (interaction.axis === null) {
            const base = Math.hypot(from.x, from.y)
            const reach = Math.hypot(to.x, to.y)
            const factor = Math.max(
              0.01,
              base > 40 ? reach / base : 2 ** ((reach - base) / 120)
            )
            write({
              scale: original.scale.map((value) =>
                Math.min(50, Math.max(0.01, Number((value * factor).toFixed(3))))
              ) as Vec3,
            })
            return
          }
          const screen = axisScreen(start, start.localAxes[interaction.axis]!)
          if (screen.pixels < 1) return
          const along = (vector: Point) =>
            vector.x * screen.direction.x + vector.y * screen.direction.y
          const base = along(from)
          const factor =
            Math.abs(base) > 40
              ? along(to) / base
              : 2 ** ((along(to) - base) / 120)
          const scale = [...original.scale] as Vec3
          scale[interaction.axis] = Math.min(
            50,
            Math.max(0.01, Number((scale[interaction.axis] * factor).toFixed(3)))
          )
          write({ scale })
          return
        }
        default: {
          if (interaction.shift) {
            write({
              shift: [
                Number((original.shift[0] + dx / start.shorter).toFixed(3)),
                Number((original.shift[1] - dy / start.shorter).toFixed(3)),
              ],
            })
            return
          }
          write({
            elevation: Math.max(
              -85,
              Math.min(85, Math.round((original.elevation + dy * 0.35) * 10) / 10)
            ),
            orbit: Math.round((original.orbit - dx * 0.35) * 10) / 10,
          })
        }
      }
    },
    [write]
  )

  const finish = useCallback(
    (commit: boolean) => {
      const active = session.current
      if (!active) return
      session.current = null
      setHud(null)
      if (!commit) write(active.original)
      useEditorStore.getState().endInteractiveEdit()
    },
    [write]
  )

  const begin = useCallback(
    (interaction: Interaction, origin: Point, pointer: number | null, modal: boolean) => {
      const view = viewRef.current
      if (!(layerId && view) || session.current) return false
      const params =
        useLayerStore.getState().layers.find((entry) => entry.id === layerId)?.params ??
        {}
      const next: Session = {
        angle: screenAngle(view, origin),
        interaction,
        modal,
        origin,
        original: readTransform(params),
        pointer,
        sweep: 0,
        view,
      }
      session.current = next
      useEditorStore.getState().beginInteractiveEdit()
      setHud(describe(next))
      return true
    },
    [layerId]
  )

  const restart = useCallback(
    (interaction: Interaction) => {
      const active = session.current
      if (!active) return
      write(active.original)
      active.interaction = interaction
      active.sweep = 0
      active.angle = screenAngle(active.view, lastPointer.current ?? active.origin)
      setHud(describe(active))
      if (lastPointer.current) apply(active, lastPointer.current)
    },
    [apply, write]
  )

  useEffect(() => {
    if (!layerId) return
    const onKey = (event: KeyboardEvent) => {
      const active = session.current
      if (active) {
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          finish(false)
          return
        }
        if (active.modal && event.key === "Enter") {
          event.preventDefault()
          event.stopPropagation()
          finish(true)
          return
        }
        if (!active.modal) return
        const key = event.key.toLowerCase()
        const axisIndex = ["x", "y", "z"].indexOf(key)
        const { interaction } = active
        if (axisIndex !== -1 && interaction.kind !== "orbit") {
          event.preventDefault()
          event.stopPropagation()
          const axis = axisIndex as Axis
          if (interaction.kind === "rotate") {
            restart({ axis: interaction.axis === axis ? "view" : axis, kind: "rotate" })
          } else {
            restart({ axis: interaction.axis === axis ? null : axis, kind: interaction.kind })
          }
          return
        }
        if (key === "r" && interaction.kind === "rotate") {
          event.preventDefault()
          event.stopPropagation()
          restart({
            axis: interaction.axis === "trackball" ? "view" : "trackball",
            kind: "rotate",
          })
        }
        return
      }
      if (disabled || event.metaKey || event.ctrlKey || isEditableTarget(event.target))
        return
      const pointer = lastPointer.current
      if (event.altKey) {
        const cleared = CLEAR_KEYS[event.code]
        if (!(cleared && pointer && layerId)) return
        event.preventDefault()
        event.stopPropagation()
        useLayerStore.getState().updateLayerParam(layerId, cleared.key, cleared.value)
        return
      }
      if (!pointer) return
      const key = event.key.toLowerCase()
      let interaction: Interaction | null = null
      if (key === "g") interaction = { axis: null, kind: "move" }
      if (key === "r") interaction = { axis: "view", kind: "rotate" }
      if (key === "s") interaction = { axis: null, kind: "scale" }
      if (!interaction) return
      event.preventDefault()
      event.stopPropagation()
      begin(interaction, pointer, null, true)
    }
    const onMove = (event: PointerEvent) => {
      const point = toLocal(event.clientX, event.clientY)
      const element = host.current
      if (!(point && element)) return
      const inside =
        point.x >= 0 &&
        point.y >= 0 &&
        point.x <= element.clientWidth &&
        point.y <= element.clientHeight
      lastPointer.current = inside || session.current ? point : null
      const active = session.current
      if (active?.modal) apply(active, point)
    }
    const onDown = (event: PointerEvent) => {
      const active = session.current
      if (!active?.modal) return
      event.preventDefault()
      event.stopPropagation()
      finish(event.button === 0)
    }
    const onContextMenu = (event: MouseEvent) => {
      if (session.current?.modal) event.preventDefault()
    }
    const onBlur = () => finish(false)
    window.addEventListener("keydown", onKey, true)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("contextmenu", onContextMenu, true)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("contextmenu", onContextMenu, true)
      window.removeEventListener("blur", onBlur)
      finish(false)
    }
  }, [apply, begin, disabled, finish, layerId, restart, toLocal])

  useEffect(() => {
    if (!layerId) return
    const viewport = host.current?.closest<HTMLElement>("[role='application']")
    if (!viewport) return
    const onDown = (event: PointerEvent) => {
      if (event.button !== 1 || disabled || session.current) return
      const point = toLocal(event.clientX, event.clientY)
      if (!point) return
      event.preventDefault()
      if (begin({ kind: "orbit", shift: event.shiftKey }, point, event.pointerId, false)) {
        viewport.setPointerCapture(event.pointerId)
      }
    }
    const onMove = (event: PointerEvent) => {
      const active = session.current
      if (!active || active.modal || active.pointer !== event.pointerId) return
      if (active.interaction.kind !== "orbit") return
      const point = toLocal(event.clientX, event.clientY)
      if (point) apply(active, point)
    }
    const onUp = (event: PointerEvent) => {
      const active = session.current
      if (active?.interaction.kind === "orbit" && active.pointer === event.pointerId) {
        finish(true)
      }
    }
    viewport.addEventListener("pointerdown", onDown)
    viewport.addEventListener("pointermove", onMove)
    viewport.addEventListener("pointerup", onUp)
    viewport.addEventListener("pointercancel", onUp)
    return () => {
      viewport.removeEventListener("pointerdown", onDown)
      viewport.removeEventListener("pointermove", onMove)
      viewport.removeEventListener("pointerup", onUp)
      viewport.removeEventListener("pointercancel", onUp)
    }
  }, [apply, begin, disabled, finish, layerId, toLocal])

  if (!(layer && view) || disabled) return null

  const start = (interaction: Interaction) => (event: ReactPointerEvent<SVGElement>) => {
    if (panning || event.button !== 0 || session.current) return
    const point = toLocal(event.clientX, event.clientY)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    if (begin(interaction, point, event.pointerId, false)) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }
  const drag = (event: ReactPointerEvent<SVGElement>) => {
    const active = session.current
    if (!active || active.modal || active.pointer !== event.pointerId) return
    event.stopPropagation()
    const point = toLocal(event.clientX, event.clientY)
    if (point) apply(active, point)
  }
  const end = (event: ReactPointerEvent<SVGElement>) => {
    const active = session.current
    if (!active || active.modal || active.pointer !== event.pointerId) return
    finish(true)
  }
  const handlers = (interaction: Interaction, cursor: string) => ({
    onLostPointerCapture: end,
    onPointerCancel: end,
    onPointerDown: start(interaction),
    onPointerMove: drag,
    onPointerUp: end,
    style: { cursor: panning ? "inherit" : cursor, pointerEvents: "all" as const },
  })

  const { center } = view
  const body = Math.max(18, Math.min(view.bodyRadius, Math.max(box.width, box.height)))
  const free = freeInteraction(mode)

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      data-model-gizmo={mode}
      ref={(element) => {
        host.current = element
        setHostElement(element)
      }}
    >
      <svg
        aria-label="3D model gizmo"
        className="absolute inset-0 h-full w-full overflow-visible"
        role="application"
        style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.85))" }}
      >
        <circle
          cx={center.x}
          cy={center.y}
          data-model-gizmo-handle="body"
          fill="transparent"
          r={body}
          stroke="rgba(255,255,255,0.35)"
          strokeDasharray="4 6"
          {...handlers(free, mode === "move" ? "move" : "grab")}
        />
        {mode === "move" ? renderMove(view, handlers) : null}
        {mode === "rotate" ? renderRotate(view, handlers) : null}
        {mode === "scale" ? renderScale(view, handlers) : null}
      </svg>
      {hud ? (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-[6px] bg-[rgb(12_12_16_/_0.82)] px-2 py-1 font-[var(--ds-font-mono)] text-[10px] text-white/90">
          {hud}
          <span className="text-white/50">
            {session.current?.modal
              ? "  ·  X Y Z lock an axis · click or Enter applies · Esc cancels"
              : "  ·  Esc cancels"}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function freeInteraction(mode: ModelGizmoMode): Interaction {
  if (mode === "move") return { axis: null, kind: "move" }
  if (mode === "scale") return { axis: null, kind: "scale" }
  return { axis: "trackball", kind: "rotate" }
}

type Handlers = (
  interaction: Interaction,
  cursor: string
) => Record<string, unknown>

function renderMove(view: View, handlers: Handlers) {
  const { center } = view
  return (
    <>
      {UNIT_AXES.map((axis, index) => {
        const screen = axisScreen(view, axis)
        if (screen.pixels < 10) return null
        const end = { x: center.x + screen.direction.x * screen.pixels, y: center.y + screen.direction.y * screen.pixels }
        const back = { x: end.x - screen.direction.x * 10, y: end.y - screen.direction.y * 10 }
        const side = { x: -screen.direction.y * 5, y: screen.direction.x * 5 }
        const color = AXIS_COLORS[index]
        return (
          <g data-model-gizmo-handle={`move-${AXIS_NAMES[index]}`} key={AXIS_NAMES[index]}>
            <line stroke={color} strokeWidth={2} x1={center.x} x2={back.x} y1={center.y} y2={back.y} />
            <polygon
              fill={color}
              points={`${end.x},${end.y} ${back.x + side.x},${back.y + side.y} ${back.x - side.x},${back.y - side.y}`}
            />
            <line
              stroke="transparent"
              strokeLinecap="round"
              strokeWidth={16}
              x1={center.x + screen.direction.x * 12}
              x2={end.x}
              y1={center.y + screen.direction.y * 12}
              y2={end.y}
              {...handlers({ axis: index as Axis, kind: "move" }, "move")}
            />
          </g>
        )
      })}
      <circle
        cx={center.x}
        cy={center.y}
        data-model-gizmo-handle="move-view"
        fill="rgba(255,255,255,0.12)"
        r={8}
        stroke="white"
        strokeWidth={1.5}
        {...handlers({ axis: null, kind: "move" }, "move")}
      />
    </>
  )
}

function renderRotate(view: View, handlers: Handlers) {
  const { center } = view
  const viewRadius = GIZMO_PX * 1.25
  return (
    <>
      <circle
        cx={center.x}
        cy={center.y}
        data-model-gizmo-handle="rotate-view"
        fill="none"
        r={viewRadius}
        stroke="rgba(255,255,255,0.85)"
        strokeWidth={1.5}
      />
      <circle
        cx={center.x}
        cy={center.y}
        fill="none"
        r={viewRadius}
        stroke="transparent"
        strokeWidth={14}
        {...handlers({ axis: "view", kind: "rotate" }, "grab")}
      />
      {UNIT_AXES.map((axis, index) => {
        const path = ringPath(view, axis)
        return (
          <g data-model-gizmo-handle={`rotate-${AXIS_NAMES[index]}`} key={AXIS_NAMES[index]}>
            <path d={path} fill="none" stroke={AXIS_COLORS[index]} strokeWidth={2} />
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              {...handlers({ axis: index as Axis, kind: "rotate" }, "grab")}
            />
          </g>
        )
      })}
      <circle cx={center.x} cy={center.y} fill="white" r={2.5} />
    </>
  )
}

function renderScale(view: View, handlers: Handlers) {
  const { center } = view
  return (
    <>
      {view.localAxes.map((axis, index) => {
        const screen = axisScreen(view, axis)
        if (screen.pixels < 10) return null
        const end = { x: center.x + screen.direction.x * screen.pixels, y: center.y + screen.direction.y * screen.pixels }
        const color = AXIS_COLORS[index]
        return (
          <g data-model-gizmo-handle={`scale-${AXIS_NAMES[index]}`} key={AXIS_NAMES[index]}>
            <line stroke={color} strokeWidth={2} x1={center.x} x2={end.x} y1={center.y} y2={end.y} />
            <rect fill={color} height={9} width={9} x={end.x - 4.5} y={end.y - 4.5} />
            <line
              stroke="transparent"
              strokeLinecap="round"
              strokeWidth={16}
              x1={center.x + screen.direction.x * 12}
              x2={end.x}
              y1={center.y + screen.direction.y * 12}
              y2={end.y}
              {...handlers({ axis: index as Axis, kind: "scale" }, "nwse-resize")}
            />
          </g>
        )
      })}
      <circle
        cx={center.x}
        cy={center.y}
        data-model-gizmo-handle="scale-uniform"
        fill="rgba(255,255,255,0.12)"
        r={9}
        stroke="white"
        strokeWidth={1.5}
        {...handlers({ axis: null, kind: "scale" }, "nwse-resize")}
      />
    </>
  )
}
