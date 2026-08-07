"use client"

import { Popover } from "@base-ui/react/popover"
import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react"
import { Typography } from "@/components/ui/typography"
import { cn } from "@/lib/cn"
import {
  type CubicBezierPoints,
  EASING_PRESETS,
  findMatchingPreset,
  formatBezierForDisplay,
  type KeyframeEasing,
  parseEasingString,
} from "@/lib/easing-curve"

/* ─── Graph constants ─── */
const GRAPH_SIZE = 180
const GRAPH_PADDING = 24
const INNER_SIZE = GRAPH_SIZE - 2 * GRAPH_PADDING
const PRESET_CATEGORIES = [
  ["basic", "Foundation"],
  ["out", "Out"],
  ["in", "In"],
  ["inOut", "In Out"],
  ["expressive", "Expressive"],
] as const

function curveToSvg(cx: number, cy: number): [number, number] {
  return [
    GRAPH_PADDING + cx * INNER_SIZE,
    GRAPH_PADDING + (1 - cy) * INNER_SIZE,
  ]
}

function svgToCurve(
  clientX: number,
  clientY: number,
  rect: DOMRect
): [number, number] {
  const scaleX = GRAPH_SIZE / rect.width
  const scaleY = GRAPH_SIZE / rect.height
  const localX = (clientX - rect.left) * scaleX
  const localY = (clientY - rect.top) * scaleY
  return [
    Math.max(0, Math.min(1, (localX - GRAPH_PADDING) / INNER_SIZE)),
    Math.max(-1, Math.min(2, 1 - (localY - GRAPH_PADDING) / INNER_SIZE)),
  ]
}

function buildCurvePath(cp: CubicBezierPoints): string {
  const [sx, sy] = curveToSvg(0, 0)
  const [c1x, c1y] = curveToSvg(cp[0], cp[1])
  const [c2x, c2y] = curveToSvg(cp[2], cp[3])
  const [ex, ey] = curveToSvg(1, 1)
  return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`
}

function PresetThumbnail({ cp }: { cp: CubicBezierPoints }) {
  const W = 28
  const H = 20
  const P = 3
  const toX = (v: number) => P + v * (W - 2 * P)
  const toY = (v: number) => H - P - v * (H - 2 * P)

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none"
      fill="none"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
    >
      <path
        d={`M ${toX(0)} ${toY(0)} C ${toX(cp[0])} ${toY(cp[1])}, ${toX(cp[2])} ${toY(cp[3])}, ${toX(1)} ${toY(1)}`}
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </svg>
  )
}

export function CurvePreview({
  easing,
  size = 20,
}: {
  easing: KeyframeEasing
  size?: number
}) {
  const P = 3

  if (easing.type === "step") {
    return (
      <svg
        aria-hidden="true"
        className="pointer-events-none"
        fill="none"
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
      >
        <path
          d={`M ${P} ${size - P} H ${size - P} V ${P}`}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth={1.5}
        />
      </svg>
    )
  }

  const cp = easing.controlPoints
  const toX = (v: number) => P + v * (size - 2 * P)
  const toY = (v: number) => size - P - v * (size - 2 * P)

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none"
      fill="none"
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
    >
      <path
        d={`M ${toX(0)} ${toY(0)} C ${toX(cp[0])} ${toY(cp[1])}, ${toX(cp[2])} ${toY(cp[3])}, ${toX(1)} ${toY(1)}`}
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </svg>
  )
}

type DragTarget = "p1" | "p2"

interface CurveEditorProps {
  easing: KeyframeEasing
  onChange: (easing: KeyframeEasing) => void
}

function CurveEditorContent({ easing, onChange }: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null)
  const [rawInput, setRawInput] = useState(() =>
    easing.type === "step"
      ? "step"
      : formatBezierForDisplay(easing.controlPoints)
  )
  const [inputError, setInputError] = useState<string | null>(null)

  const activePreset = findMatchingPreset(easing)
  const isStep = easing.type === "step"
  const isBezier = easing.type === "bezier"
  const cp: CubicBezierPoints = isBezier ? easing.controlPoints : [0, 0, 1, 1]
  let inputStateLabel = "Custom"

  if (isStep) {
    inputStateLabel = "step"
  } else if (activePreset) {
    inputStateLabel = "Preset matched"
  }
  const groupedPresets = useMemo(
    () =>
      PRESET_CATEGORIES.map(([category, label]) => ({
        label,
        presets: EASING_PRESETS.filter(
          (preset) => preset.category === category
        ),
      })).filter((group) => group.presets.length > 0),
    []
  )

  useEffect(() => {
    setRawInput(isBezier ? formatBezierForDisplay(cp) : "step")
    setInputError(null)
  }, [cp, isBezier])

  const handleDragMove = useEffectEvent((event: PointerEvent) => {
    if (!(dragTarget && isBezier)) return

    const svg = svgRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    const [cx, cy] = svgToCurve(event.clientX, event.clientY, rect)

    const next: CubicBezierPoints = [...cp]
    if (dragTarget === "p1") {
      next[0] = cx
      next[1] = cy
    } else {
      next[2] = cx
      next[3] = cy
    }

    onChange({ controlPoints: next, type: "bezier" })
  })

  const handleInputCommit = useEffectEvent(() => {
    const parsed = parseEasingString(rawInput)

    if (!parsed) {
      setInputError("Use cubic-bezier(x1, y1, x2, y2) or step.")
      return
    }

    onChange(parsed)
    setInputError(null)
  })

  const handleRawInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setRawInput(event.currentTarget.value)
    if (inputError) {
      setInputError(null)
    }
  }

  const handleDragEnd = useEffectEvent(() => {
    setDragTarget(null)
  })

  useEffect(() => {
    if (!dragTarget) return

    window.addEventListener("pointermove", handleDragMove)
    window.addEventListener("pointerup", handleDragEnd)
    window.addEventListener("pointercancel", handleDragEnd)

    return () => {
      window.removeEventListener("pointermove", handleDragMove)
      window.removeEventListener("pointerup", handleDragEnd)
      window.removeEventListener("pointercancel", handleDragEnd)
    }
  }, [dragTarget])

  useEffect(() => {
    if (!dragTarget) return

    const prev = document.body.style.cursor
    document.body.style.cursor = "grabbing"
    return () => {
      document.body.style.cursor = prev
    }
  }, [dragTarget])

  const handleStartDrag =
    (target: DragTarget) => (e: ReactPointerEvent<SVGCircleElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setDragTarget(target)
    }

  const [sx, sy] = curveToSvg(0, 0)
  const [ex, ey] = curveToSvg(1, 1)
  const [p1x, p1y] = curveToSvg(cp[0], cp[1])
  const [p2x, p2y] = curveToSvg(cp[2], cp[3])

  return (
    <div className="flex w-[340px] flex-col gap-3 p-3">
      <div className="relative overflow-hidden rounded-[14px] border border-white/6 bg-[linear-gradient(180deg,rgb(255_255_255_/_0.045)_0%,rgb(255_255_255_/_0.018)_100%)] px-3 py-3 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.05)]">
        <svg
          aria-label="Easing curve editor"
          className="block select-none"
          height={GRAPH_SIZE}
          ref={svgRef}
          role="img"
          style={{ touchAction: "none" }}
          viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`}
          width="100%"
        >
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
          {[0.25, 0.5, 0.75].map((t) => {
            const [gx] = curveToSvg(t, 0)
            const [, gy] = curveToSvg(0, t)
            return (
              <g key={t}>
                <line
                  stroke="rgb(255 255 255 / 0.04)"
                  strokeWidth={1}
                  x1={gx}
                  x2={gx}
                  y1={GRAPH_PADDING}
                  y2={GRAPH_SIZE - GRAPH_PADDING}
                />
                <line
                  stroke="rgb(255 255 255 / 0.04)"
                  strokeWidth={1}
                  x1={GRAPH_PADDING}
                  x2={GRAPH_SIZE - GRAPH_PADDING}
                  y1={gy}
                  y2={gy}
                />
              </g>
            )
          })}

          <line
            stroke="rgb(255 255 255 / 0.08)"
            strokeDasharray="3 3"
            strokeWidth={1}
            x1={sx}
            x2={ex}
            y1={sy}
            y2={ey}
          />

          {isStep ? (
            <>
              <line
                stroke="rgb(255 255 255 / 0.85)"
                strokeLinecap="round"
                strokeWidth={2}
                x1={sx}
                x2={ex}
                y1={sy}
                y2={sy}
              />
              <line
                stroke="rgb(255 255 255 / 0.85)"
                strokeDasharray="3 2"
                strokeLinecap="round"
                strokeWidth={1.5}
                x1={ex}
                x2={ex}
                y1={sy}
                y2={ey}
              />
            </>
          ) : (
            <>
              <line
                stroke="rgb(255 255 255 / 0.25)"
                strokeWidth={1}
                x1={sx}
                x2={p1x}
                y1={sy}
                y2={p1y}
              />
              <line
                stroke="rgb(255 255 255 / 0.25)"
                strokeWidth={1}
                x1={ex}
                x2={p2x}
                y1={ey}
                y2={p2y}
              />

              <path
                d={buildCurvePath(cp)}
                fill="none"
                stroke="rgb(255 255 255 / 0.85)"
                strokeLinecap="round"
                strokeWidth={2}
              />

              {/* Endpoints */}
              <circle cx={sx} cy={sy} fill="rgb(255 255 255 / 0.5)" r={3} />
              <circle cx={ex} cy={ey} fill="rgb(255 255 255 / 0.5)" r={3} />

              <circle
                className="cursor-grab active:cursor-grabbing"
                cx={p1x}
                cy={p1y}
                fill="white"
                onPointerDown={handleStartDrag("p1")}
                r={5}
                stroke="rgb(0 0 0 / 0.3)"
                strokeWidth={1}
              />
              <circle
                className="cursor-grab active:cursor-grabbing"
                cx={p2x}
                cy={p2y}
                fill="white"
                onPointerDown={handleStartDrag("p2")}
                r={5}
                stroke="rgb(0 0 0 / 0.3)"
                strokeWidth={1}
              />
            </>
          )}
        </svg>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between">
          <Typography
            className="font-[var(--ds-font-mono)] text-[10px]"
            tone="tertiary"
          >
            0.0
          </Typography>
          <Typography
            className="font-[var(--ds-font-mono)] text-[10px]"
            tone="tertiary"
          >
            1.0
          </Typography>
        </div>
      </div>

      <div className="max-h-[272px] overflow-y-auto rounded-[14px] border border-white/6 bg-[linear-gradient(180deg,rgb(255_255_255_/_0.03)_0%,rgb(255_255_255_/_0.015)_100%)] px-3 py-3">
        <div className="flex flex-col gap-4">
          <button
            className={cn(
              "inline-flex items-center gap-2 self-start rounded-[10px] border px-2.5 py-1.5 transition-[background-color,border-color,color] duration-140 ease-[var(--ease-out-cubic)] hover:bg-white/6 hover:border-white/10",
              isStep
                ? "border-white/14 bg-white/8 text-[var(--ds-color-text-primary)]"
                : "border-white/6 text-[var(--ds-color-text-secondary)]"
            )}
            onClick={() => onChange({ type: "step" })}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="pointer-events-none"
              fill="none"
              height={20}
              viewBox="0 0 28 20"
              width={28}
            >
              <path
                d="M 3 17 H 25 V 3"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth={1.5}
              />
            </svg>
            <span className="font-[var(--ds-font-mono)] text-[11px] leading-[14px]">
              Step Hold
            </span>
          </button>

          {groupedPresets.map((group) => (
            <div className="flex flex-col gap-2" key={group.label}>
              <Typography
                className="tracking-[0.08em] uppercase"
                tone="secondary"
                variant="overline"
              >
                {group.label}
              </Typography>

              <div className="grid grid-cols-2 gap-1.5">
                {group.presets.map((preset) => (
                  <button
                    className={cn(
                      "inline-flex items-center gap-2 rounded-[10px] border px-2.5 py-2 text-left transition-[background-color,border-color,color,transform] duration-140 ease-[var(--ease-out-cubic)] hover:bg-white/6 hover:border-white/10 active:scale-[0.985]",
                      activePreset === preset.name
                        ? "border-white/14 bg-white/8 text-[var(--ds-color-text-primary)]"
                        : "border-white/6 text-[var(--ds-color-text-secondary)]"
                    )}
                    key={preset.name}
                    onClick={() =>
                      onChange({
                        controlPoints: [...preset.controlPoints],
                        type: "bezier",
                      })
                    }
                    type="button"
                  >
                    <PresetThumbnail cp={preset.controlPoints} />
                    <span className="font-[var(--ds-font-mono)] text-[11px] leading-[14px]">
                      {preset.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Typography
                className="tracking-[0.08em] uppercase"
                tone="secondary"
                variant="overline"
              >
                Curve Values
              </Typography>
              <Typography
                className="font-[var(--ds-font-mono)] text-[10px]"
                tone="tertiary"
              >
                {inputStateLabel}
              </Typography>
            </div>

            <input
              className="h-10 rounded-[10px] border border-white/8 bg-black/20 px-3 font-[var(--ds-font-mono)] text-[12px] text-[var(--ds-color-text-primary)] outline-none transition-[border-color,background-color] duration-140 ease-[var(--ease-out-cubic)] placeholder:text-[var(--ds-color-text-muted)] focus:border-white/18 focus:bg-white/[0.04]"
              onBlur={handleInputCommit}
              onChange={handleRawInputChange}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  handleInputCommit()
                }
              }}
              placeholder="0.19, 1, 0.22, 1 or 0.19 1 0.22 1"
              type="text"
              value={rawInput}
            />

            {inputError ? (
              <Typography
                className="font-[var(--ds-font-mono)] text-[10px]"
                tone="tertiary"
              >
                {inputError}
              </Typography>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export function CurveEditorPopover({ easing, onChange }: CurveEditorProps) {
  return (
    <Popover.Root modal={false}>
      <Popover.Trigger
        aria-label="Edit easing curve"
        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[var(--ds-radius-icon)] border border-[var(--ds-border-divider)] bg-[var(--ds-color-surface-control)] text-[var(--ds-color-text-secondary)] transition-[background-color,border-color,color,transform] duration-160 ease-[var(--ease-out-cubic)] hover:bg-white/8 hover:border-[var(--ds-border-hover)] active:scale-[0.96] data-[popup-open]:bg-white/8 data-[popup-open]:border-[var(--ds-border-hover)] data-[popup-open]:text-[var(--ds-color-text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-border-active)]"
      >
        <CurvePreview easing={easing} />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          align="end"
          className="z-50 outline-none"
          collisionPadding={12}
          side="top"
          sideOffset={10}
        >
          <Popover.Popup className="max-h-[min(480px,var(--available-height))] overflow-y-auto overscroll-contain rounded-[16px] border border-[var(--ds-border-panel)] bg-[rgb(18_18_22_/_0.88)] shadow-[var(--ds-shadow-panel-dark)] backdrop-blur-[28px] transition-[opacity,transform] duration-160 ease-[var(--ease-out-cubic)] data-[closed]:opacity-0 data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0">
            <CurveEditorContent easing={easing} onChange={onChange} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
