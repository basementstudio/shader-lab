/**
 * Easing Curve System
 *
 * Defines cubic bezier-based easing for keyframe transitions.
 * Uses CSS cubic-bezier(x1, y1, x2, y2) format where:
 *   - Start point is always (0, 0)
 *   - End point is always (1, 1)
 *   - Control points define the curve shape
 *
 * Each keyframe stores its own easing, describing the transition
 * FROM that keyframe TO the next one.
 */

/** CSS cubic-bezier control points: [x1, y1, x2, y2] */
export type CubicBezierPoints = [number, number, number, number]

export type KeyframeEasing =
  | { type: "bezier"; controlPoints: CubicBezierPoints }
  | { type: "step" }

export type EasingPresetName =
  | "linear"
  | "quickOut"
  | "swiftOut"
  | "snappyOut"
  | "outCubic"
  | "easeIn"
  | "inCirc"
  | "inQuint"
  | "easeOut"
  | "easeInOut"
  | "inOutQuart"
  | "inOutQuint"
  | "inOutExpo"
  | "inOutCirc"
  | "smooth"
  | "anticipate"
  | "backIn"
  | "backOut"

export interface EasingPreset {
  category: "basic" | "expressive" | "in" | "inOut" | "out"
  controlPoints: CubicBezierPoints
  label: string
  name: EasingPresetName
}

export const EASING_PRESETS: readonly EasingPreset[] = [
  { category: "basic", controlPoints: [0, 0, 1, 1], label: "Linear", name: "linear" },
  { category: "basic", controlPoints: [0.65, 0, 0.35, 1], label: "Smooth", name: "smooth" },
  { category: "expressive", controlPoints: [1, -0.4, 0.35, 0.95], label: "Anticipate", name: "anticipate" },
  { category: "expressive", controlPoints: [0.36, 0, 0.66, -0.56], label: "Back In", name: "backIn" },
  { category: "expressive", controlPoints: [0.34, 1.56, 0.64, 1], label: "Back Out", name: "backOut" },
  { category: "out", controlPoints: [0, 0, 0.2, 1], label: "Quick Out", name: "quickOut" },
  { category: "out", controlPoints: [0.175, 0.885, 0.32, 1.1], label: "Swift Out", name: "swiftOut" },
  { category: "out", controlPoints: [0.19, 1, 0.22, 1], label: "Snappy Out", name: "snappyOut" },
  { category: "out", controlPoints: [0.215, 0.61, 0.355, 1], label: "Out Cubic", name: "outCubic" },
  { category: "out", controlPoints: [0, 0, 0.58, 1], label: "Ease Out", name: "easeOut" },
  { category: "in", controlPoints: [0.42, 0, 1, 1], label: "Ease In", name: "easeIn" },
  { category: "in", controlPoints: [0.6, 0.04, 0.98, 0.335], label: "In Circ", name: "inCirc" },
  { category: "in", controlPoints: [0.755, 0.05, 0.855, 0.06], label: "In Quint", name: "inQuint" },
  { category: "inOut", controlPoints: [0.42, 0, 0.58, 1], label: "Ease In Out", name: "easeInOut" },
  { category: "inOut", controlPoints: [0.77, 0, 0.175, 1], label: "In Out Quart", name: "inOutQuart" },
  { category: "inOut", controlPoints: [0.86, 0, 0.07, 1], label: "In Out Quint", name: "inOutQuint" },
  { category: "inOut", controlPoints: [1, 0, 0, 1], label: "In Out Expo", name: "inOutExpo" },
  { category: "inOut", controlPoints: [0.785, 0.135, 0.15, 0.86], label: "In Out Circ", name: "inOutCirc" },
] as const

export const LINEAR_EASING: KeyframeEasing = {
  controlPoints: [0, 0, 1, 1],
  type: "bezier",
}

export const SMOOTH_EASING: KeyframeEasing = {
  controlPoints: [0.65, 0, 0.35, 1],
  type: "bezier",
}

export const STEP_EASING: KeyframeEasing = { type: "step" }

/**
 * Evaluate a cubic bezier easing curve at a given progress value.
 *
 * Uses binary search to find the parametric t where B_x(t) = progress,
 * then evaluates B_y(t) for the eased output.
 *
 * @param progress - Input progress (0 to 1)
 * @param cp - Control points [x1, y1, x2, y2]
 * @returns Eased output value
 */
export function evaluateCubicBezier(progress: number, cp: CubicBezierPoints): number {
  if (progress <= 0) return 0
  if (progress >= 1) return 1

  const [x1, y1, x2, y2] = cp

  // Fast path: linear
  if (x1 === 0 && y1 === 0 && x2 === 1 && y2 === 1) {
    return progress
  }

  // Binary search for parametric t where B_x(t) = progress
  let tLow = 0
  let tHigh = 1
  let t = progress // initial guess

  for (let i = 0; i < 20; i++) {
    const mt = 1 - t
    const mt2 = mt * mt
    const t2 = t * t
    // B_x(t) = 3(1-t)^2 * t * x1 + 3(1-t) * t^2 * x2 + t^3
    const bx = 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t2 * t

    if (Math.abs(bx - progress) < 1e-6) break

    if (bx < progress) {
      tLow = t
    } else {
      tHigh = t
    }

    t = (tLow + tHigh) / 2
  }

  // Evaluate B_y(t)
  const mt = 1 - t
  const mt2 = mt * mt
  const t2 = t * t
  return 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t2 * t
}

/**
 * Resolve a KeyframeEasing to an eased progress value.
 */
export function resolveEasing(progress: number, easing: KeyframeEasing): number {
  if (easing.type === "step") return 0
  return evaluateCubicBezier(progress, easing.controlPoints)
}

/**
 * Get the default easing for a given value type.
 * Boolean/select types default to step; continuous types default to smooth.
 */
export function defaultEasingForValueType(
  valueType: string,
): KeyframeEasing {
  if (valueType === "boolean" || valueType === "select") {
    return { type: "step" }
  }

  return { controlPoints: [0.65, 0, 0.35, 1], type: "bezier" }
}

/**
 * Check if a preset matches the given easing control points.
 */
export function findMatchingPreset(easing: KeyframeEasing): EasingPresetName | null {
  if (easing.type === "step") return null

  const [x1, y1, x2, y2] = easing.controlPoints
  const tolerance = 0.005

  for (const preset of EASING_PRESETS) {
    const [px1, py1, px2, py2] = preset.controlPoints

    if (
      Math.abs(x1 - px1) < tolerance &&
      Math.abs(y1 - py1) < tolerance &&
      Math.abs(x2 - px2) < tolerance &&
      Math.abs(y2 - py2) < tolerance
    ) {
      return preset.name
    }
  }

  return null
}

/**
 * Clone a KeyframeEasing value.
 */
export function cloneEasing(easing: KeyframeEasing): KeyframeEasing {
  if (easing.type === "step") return { type: "step" }
  return { controlPoints: [...easing.controlPoints], type: "bezier" }
}

export function formatBezierForDisplay(controlPoints: CubicBezierPoints): string {
  return controlPoints.map((value) => Number(value.toFixed(3))).join(", ")
}

export function parseEasingString(value: string): KeyframeEasing | null {
  const normalized = value.trim()

  if (normalized.length === 0) {
    return null
  }

  if (normalized.toLowerCase() === "step") {
    return { type: "step" }
  }

  const bezierMatch = normalized.match(/^cubic-bezier\((.+)\)$/i)
  const rawValues = (bezierMatch?.[1] ?? normalized).trim()
  const parts = rawValues
    .split(/[,\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => Number.parseFloat(part.trim()))

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null
  }

  return {
    controlPoints: [parts[0]!, parts[1]!, parts[2]!, parts[3]!],
    type: "bezier",
  }
}

/**
 * Migrate a legacy track-level interpolation string to a KeyframeEasing.
 */
export function migrateInterpolationToEasing(
  interpolation: "linear" | "smooth" | "step" | string,
): KeyframeEasing {
  switch (interpolation) {
    case "step":
      return { type: "step" }
    case "smooth":
      return { controlPoints: [0.65, 0, 0.35, 1], type: "bezier" }
    default:
      return { controlPoints: [0, 0, 1, 1], type: "bezier" }
  }
}
