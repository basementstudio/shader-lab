"use client"

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { cn } from "@/lib/cn"
import {
  cloneColorCurves,
  COLOR_CURVE_CHANNELS,
  createDefaultColorCurves,
  getMonotoneCurveTangents,
  normalizeCurvePoints,
  type ColorCurveChannelId,
  type ColorCurvePoint,
  type SceneColorCurves,
} from "@/lib/color-curves"

type ColorCurvesEditorProps = {
  className?: string
  onChange: (nextValue: SceneColorCurves) => void
  value: SceneColorCurves
}

const GRAPH_SIZE = 268
const GRAPH_PADDING = 18
const INNER_SIZE = GRAPH_SIZE - GRAPH_PADDING * 2
const HANDLE_RADIUS = 6
const MIN_POINT_GAP = 0.01

const CHANNEL_META: Record<
  ColorCurveChannelId,
  {
    accent: string
    label: string
  }
> = {
  blue: {
    accent: "#66a3ff",
    label: "B",
  },
  green: {
    accent: "#61ff88",
    label: "G",
  },
  red: {
    accent: "#ff5f5f",
    label: "R",
  },
  rgb: {
    accent: "#f4f4f1",
    label: "RGB",
  },
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function curveToSvg(point: ColorCurvePoint): [number, number] {
  return [
    GRAPH_PADDING + point.x * INNER_SIZE,
    GRAPH_PADDING + (1 - point.y) * INNER_SIZE,
  ]
}

function buildCurvePath(points: ColorCurvePoint[]): string {
  const normalizedPoints = normalizeCurvePoints(points)
  const tangents = getMonotoneCurveTangents(normalizedPoints)

  if (normalizedPoints.length === 0) {
    return ""
  }

  if (normalizedPoints.length === 1) {
    const [x, y] = curveToSvg(normalizedPoints[0]!)
    return `M ${x} ${y}`
  }

  const [startX, startY] = curveToSvg(normalizedPoints[0]!)
  const segments = [`M ${startX} ${startY}`]

  for (let index = 0; index < normalizedPoints.length - 1; index += 1) {
    const pointA = normalizedPoints[index]!
    const pointB = normalizedPoints[index + 1]!
    const width = pointB.x - pointA.x
    const controlPointA = {
      x: pointA.x + width / 3,
      y: pointA.y + (width * (tangents[index] ?? 0)) / 3,
    }
    const controlPointB = {
      x: pointB.x - width / 3,
      y: pointB.y - (width * (tangents[index + 1] ?? 0)) / 3,
    }

    const [cp1x, cp1y] = curveToSvg(controlPointA)
    const [cp2x, cp2y] = curveToSvg(controlPointB)
    const [x, y] = curveToSvg(pointB)
    segments.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x} ${y}`)
  }

  return segments.join(" ")
}

function findClosestPointIndex(
  points: ColorCurvePoint[],
  x: number,
  y: number
): number {
  let closestIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY

  points.forEach((point, index) => {
    const dx = point.x - x
    const dy = point.y - y
    const distance = dx * dx + dy * dy
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  })

  return closestIndex
}

export function ColorCurvesEditor({
  className,
  onChange,
  value,
}: ColorCurvesEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [activeChannel, setActiveChannel] = useState<ColorCurveChannelId>("rgb")
  const [dragState, setDragState] = useState<{
    channel: ColorCurveChannelId
    index: number
  } | null>(null)
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null
  )

  const activePoints = useMemo(
    () => normalizeCurvePoints(value[activeChannel].points),
    [activeChannel, value]
  )

  useEffect(() => {
    if (
      selectedPointIndex !== null &&
      selectedPointIndex >= activePoints.length
    ) {
      setSelectedPointIndex(null)
    }
  }, [activePoints.length, selectedPointIndex])

  useEffect(() => {
    if (!dragState) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const svg = svgRef.current
      if (!svg) {
        return
      }

      const rect = svg.getBoundingClientRect()
      const x = clamp01(
        (event.clientX - rect.left - GRAPH_PADDING) / INNER_SIZE
      )
      const y = clamp01(
        1 - (event.clientY - rect.top - GRAPH_PADDING) / INNER_SIZE
      )
      const currentPoints = normalizeCurvePoints(
        value[dragState.channel].points
      )
      const nextPoints = currentPoints.map((point) => ({ ...point }))
      const currentPoint = nextPoints[dragState.index]

      if (!currentPoint) {
        return
      }

      if (dragState.index === 0 || dragState.index === nextPoints.length - 1) {
        currentPoint.y = y
      } else {
        const previousPoint = nextPoints[dragState.index - 1]!
        const nextPoint = nextPoints[dragState.index + 1]!
        currentPoint.x = Math.min(
          nextPoint.x - MIN_POINT_GAP,
          Math.max(previousPoint.x + MIN_POINT_GAP, x)
        )
        currentPoint.y = y
      }

      const nextCurves = cloneColorCurves(value)
      nextCurves[dragState.channel].points = normalizeCurvePoints(nextPoints)
      onChange(nextCurves)
      setSelectedPointIndex(
        findClosestPointIndex(nextCurves[dragState.channel].points, x, y)
      )
    }

    const handlePointerEnd = () => {
      setDragState(null)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerEnd)
    window.addEventListener("pointercancel", handlePointerEnd)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerEnd)
      window.removeEventListener("pointercancel", handlePointerEnd)
    }
  }, [dragState, onChange, value])

  useEffect(() => {
    if (!dragState) {
      return
    }

    const previousCursor = document.body.style.cursor
    document.body.style.cursor = "grabbing"

    return () => {
      document.body.style.cursor = previousCursor
    }
  }, [dragState])

  const updateChannelPoints = (
    channel: ColorCurveChannelId,
    nextPoints: ColorCurvePoint[]
  ) => {
    const nextCurves = cloneColorCurves(value)
    nextCurves[channel].points = normalizeCurvePoints(nextPoints)
    onChange(nextCurves)
    return nextCurves[channel].points
  }

  const handleGraphPointerDown = (event: ReactPointerEvent<SVGRectElement>) => {
    event.preventDefault()

    const svg = svgRef.current
    if (!svg) {
      return
    }

    const rect = svg.getBoundingClientRect()
    const x = clamp01((event.clientX - rect.left - GRAPH_PADDING) / INNER_SIZE)
    const y = clamp01(
      1 - (event.clientY - rect.top - GRAPH_PADDING) / INNER_SIZE
    )
    const currentPoints = normalizeCurvePoints(value[activeChannel].points)
    const insertionIndex = currentPoints.findIndex((point) => point.x > x)

    if (insertionIndex <= 0) {
      const nextPoints = currentPoints.map((point) => ({ ...point }))
      nextPoints[0] = { x: 0, y }
      updateChannelPoints(activeChannel, nextPoints)
      setSelectedPointIndex(0)
      setDragState({ channel: activeChannel, index: 0 })
      return
    }

    if (insertionIndex === -1) {
      const nextPoints = currentPoints.map((point) => ({ ...point }))
      nextPoints[nextPoints.length - 1] = { x: 1, y }
      updateChannelPoints(activeChannel, nextPoints)
      setSelectedPointIndex(nextPoints.length - 1)
      setDragState({
        channel: activeChannel,
        index: nextPoints.length - 1,
      })
      return
    }

    const nextPoints = [
      ...currentPoints.slice(0, insertionIndex),
      { x, y },
      ...currentPoints.slice(insertionIndex),
    ]
    const normalizedPoints = updateChannelPoints(activeChannel, nextPoints)
    const nextIndex = findClosestPointIndex(normalizedPoints, x, y)
    setSelectedPointIndex(nextIndex)
    setDragState({ channel: activeChannel, index: nextIndex })
  }

  const handlePointPointerDown =
    (index: number) => (event: ReactPointerEvent<SVGCircleElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setSelectedPointIndex(index)
      setDragState({ channel: activeChannel, index })
    }

  const handleRemoveSelectedPoint = () => {
    if (
      selectedPointIndex === null ||
      selectedPointIndex === 0 ||
      selectedPointIndex === activePoints.length - 1
    ) {
      return
    }

    const nextPoints = activePoints.filter(
      (_point, index) => index !== selectedPointIndex
    )
    updateChannelPoints(activeChannel, nextPoints)
    setSelectedPointIndex(null)
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap gap-1.5">
        {COLOR_CURVE_CHANNELS.map((channelId) => {
          const meta = CHANNEL_META[channelId]
          const isActive = channelId === activeChannel
          return (
            <button
              aria-pressed={isActive}
              className={cn(
                "inline-flex h-7 min-w-10 items-center justify-center rounded-full border px-3 text-[11px] leading-none transition-[background-color,border-color,color] duration-160 ease-[var(--ease-out-cubic)]",
                isActive
                  ? "border-white/18 bg-white/10 text-[var(--ds-color-text-primary)]"
                  : "border-white/8 bg-white/[0.03] text-[var(--ds-color-text-secondary)] hover:border-white/14 hover:bg-white/[0.06]"
              )}
              key={channelId}
              onClick={() => {
                setActiveChannel(channelId)
                setSelectedPointIndex(null)
              }}
              type="button"
            >
              <span
                className="mr-1.5 h-2 w-2 rounded-full"
                style={{ backgroundColor: meta.accent }}
              />
              {meta.label}
            </button>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-[14px] border border-white/8 bg-[linear-gradient(180deg,rgb(255_255_255_/_0.04),rgb(255_255_255_/_0.01))] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.04)]">
        <svg
          aria-label="Color curves editor"
          className="block w-full select-none"
          ref={svgRef}
          role="img"
          style={{ touchAction: "none" }}
          viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`}
        >
          <rect
            fill="transparent"
            height={GRAPH_SIZE}
            onPointerDown={handleGraphPointerDown}
            width={GRAPH_SIZE}
          />

          {[0.25, 0.5, 0.75].map((value) => {
            const grid = GRAPH_PADDING + value * INNER_SIZE
            return (
              <g key={value}>
                <line
                  stroke="rgb(255 255 255 / 0.04)"
                  strokeWidth={1}
                  x1={grid}
                  x2={grid}
                  y1={GRAPH_PADDING}
                  y2={GRAPH_SIZE - GRAPH_PADDING}
                />
                <line
                  stroke="rgb(255 255 255 / 0.04)"
                  strokeWidth={1}
                  x1={GRAPH_PADDING}
                  x2={GRAPH_SIZE - GRAPH_PADDING}
                  y1={grid}
                  y2={grid}
                />
              </g>
            )
          })}

          <rect
            fill="none"
            height={INNER_SIZE}
            rx={2}
            stroke="rgb(255 255 255 / 0.06)"
            strokeWidth={1}
            width={INNER_SIZE}
            x={GRAPH_PADDING}
            y={GRAPH_PADDING}
          />

          <line
            stroke="rgb(255 255 255 / 0.08)"
            strokeDasharray="3 3"
            strokeWidth={1}
            x1={GRAPH_PADDING}
            x2={GRAPH_SIZE - GRAPH_PADDING}
            y1={GRAPH_SIZE - GRAPH_PADDING}
            y2={GRAPH_PADDING}
          />

          <text
            fill="rgb(255 255 255 / 0.25)"
            fontSize="9"
            textAnchor="start"
            x={GRAPH_PADDING + 2}
            y={GRAPH_SIZE - 4}
          >
            Input
          </text>
          <text
            dominantBaseline="central"
            fill="rgb(255 255 255 / 0.25)"
            fontSize="9"
            textAnchor="middle"
            transform={`rotate(-90, 7, ${GRAPH_SIZE / 2})`}
            x={7}
            y={GRAPH_SIZE / 2}
          >
            Output
          </text>

          {COLOR_CURVE_CHANNELS.map((channelId) => {
            const meta = CHANNEL_META[channelId]
            const isActive = channelId === activeChannel
            return (
              <path
                d={buildCurvePath(value[channelId].points)}
                fill="none"
                key={channelId}
                opacity={isActive ? 1 : 0.32}
                stroke={meta.accent}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={isActive ? 2.4 : 1.5}
              />
            )
          })}

          {activePoints.map((point, index) => {
            const [x, y] = curveToSvg(point)
            const isSelected = index === selectedPointIndex
            const meta = CHANNEL_META[activeChannel]

            return (
              /* biome-ignore lint/a11y/useSemanticElements: SVG curve handles need inline button semantics without switching away from circle geometry. */
              <circle
                aria-label={`Curve point ${index + 1}`}
                className="cursor-grab active:cursor-grabbing"
                cx={x}
                cy={y}
                fill={isSelected ? meta.accent : "rgb(18 18 18)"}
                key={`${activeChannel}-${point.x}-${point.y}-${index}`}
                onDoubleClick={() => {
                  if (index === 0 || index === activePoints.length - 1) {
                    return
                  }
                  const nextPoints = activePoints.filter(
                    (_activePoint, activeIndex) => activeIndex !== index
                  )
                  updateChannelPoints(activeChannel, nextPoints)
                  setSelectedPointIndex(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    setSelectedPointIndex(index)
                    return
                  }

                  if (
                    (event.key === "Backspace" || event.key === "Delete") &&
                    index !== 0 &&
                    index !== activePoints.length - 1
                  ) {
                    event.preventDefault()
                    const nextPoints = activePoints.filter(
                      (_activePoint, activeIndex) => activeIndex !== index
                    )
                    updateChannelPoints(activeChannel, nextPoints)
                    setSelectedPointIndex(null)
                  }
                }}
                onPointerDown={handlePointPointerDown(index)}
                r={isSelected ? HANDLE_RADIUS + 1 : HANDLE_RADIUS}
                role="button"
                stroke={meta.accent}
                strokeWidth={2}
                style={{
                  transition: "r 120ms ease-out, fill 120ms ease-out",
                }}
                tabIndex={0}
              />
            )
          })}
        </svg>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          aria-label="Remove selected point"
          className={cn(
            "text-[11px] leading-none underline underline-offset-3 transition-[color,text-decoration-color,opacity] duration-160 ease-[var(--ease-out-cubic)]",
            selectedPointIndex === null ||
              selectedPointIndex === 0 ||
              selectedPointIndex === activePoints.length - 1
              ? "cursor-not-allowed text-[var(--ds-color-text-disabled)] decoration-white/12 opacity-60"
              : "text-[var(--ds-color-text-muted)] decoration-white/24 hover:text-[var(--ds-color-text-secondary)] hover:decoration-white/40"
          )}
          disabled={
            selectedPointIndex === null ||
            selectedPointIndex === 0 ||
            selectedPointIndex === activePoints.length - 1
          }
          onClick={handleRemoveSelectedPoint}
          type="button"
        >
          Remove
        </button>
        <button
          aria-label="Reset active curve"
          className="text-[11px] leading-none text-[var(--ds-color-text-muted)] underline decoration-white/24 underline-offset-3 transition-[color,text-decoration-color] duration-160 ease-[var(--ease-out-cubic)] hover:text-[var(--ds-color-text-secondary)] hover:decoration-white/40"
          onClick={() => {
            const nextCurves = cloneColorCurves(value)
            nextCurves[activeChannel] =
              createDefaultColorCurves()[activeChannel]
            onChange(nextCurves)
            setSelectedPointIndex(null)
          }}
          type="button"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
