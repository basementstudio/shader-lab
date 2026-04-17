export type ColorCurveChannelId = "rgb" | "red" | "green" | "blue"

export type ColorCurvePoint = {
  x: number
  y: number
}

export type ColorCurve = {
  points: ColorCurvePoint[]
}

export type SceneColorCurves = Record<ColorCurveChannelId, ColorCurve>

export const COLOR_CURVE_CHANNELS = [
  "rgb",
  "red",
  "green",
  "blue",
] as const satisfies readonly ColorCurveChannelId[]

const MIN_POINT_GAP = 0.01

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function createIdentityCurve(): ColorCurve {
  return {
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  }
}

export function createDefaultColorCurves(): SceneColorCurves {
  return {
    blue: createIdentityCurve(),
    green: createIdentityCurve(),
    red: createIdentityCurve(),
    rgb: createIdentityCurve(),
  }
}

export function cloneColorCurves(curves: SceneColorCurves): SceneColorCurves {
  return {
    blue: { points: curves.blue.points.map((point) => ({ ...point })) },
    green: { points: curves.green.points.map((point) => ({ ...point })) },
    red: { points: curves.red.points.map((point) => ({ ...point })) },
    rgb: { points: curves.rgb.points.map((point) => ({ ...point })) },
  }
}

export function normalizeCurvePoints(
  points: ColorCurvePoint[]
): ColorCurvePoint[] {
  if (points.length === 0) {
    return createIdentityCurve().points
  }

  const sorted = points
    .map((point) => ({
      x: clamp01(point.x),
      y: clamp01(point.y),
    }))
    .sort((a, b) => a.x - b.x)

  const normalized: ColorCurvePoint[] = []

  for (const point of sorted) {
    const lastPoint = normalized[normalized.length - 1]
    if (lastPoint && Math.abs(lastPoint.x - point.x) < MIN_POINT_GAP) {
      normalized[normalized.length - 1] = {
        x: lastPoint.x,
        y: point.y,
      }
      continue
    }

    normalized.push(point)
  }

  const firstPoint = normalized[0]
  const lastPoint = normalized[normalized.length - 1]

  if (!(firstPoint && lastPoint)) {
    return createIdentityCurve().points
  }

  const interiorPoints = normalized
    .slice(1, -1)
    .map((point, index, allPoints) => {
      const previousPoint = index === 0 ? { x: 0 } : allPoints[index - 1]!
      const nextPoint =
        index === allPoints.length - 1 ? { x: 1 } : allPoints[index + 1]!
      return {
        x: Math.min(
          nextPoint.x - MIN_POINT_GAP,
          Math.max(previousPoint.x + MIN_POINT_GAP, point.x)
        ),
        y: point.y,
      }
    })
    .filter((point) => point.x > MIN_POINT_GAP && point.x < 1 - MIN_POINT_GAP)

  return [
    {
      x: 0,
      y: firstPoint.x === 0 ? firstPoint.y : 0,
    },
    ...interiorPoints,
    {
      x: 1,
      y: lastPoint.x === 1 ? lastPoint.y : 1,
    },
  ]
}

export function getMonotoneCurveTangents(points: ColorCurvePoint[]): number[] {
  const normalizedPoints = normalizeCurvePoints(points)
  return computeMonotoneCurveTangents(normalizedPoints)
}

function computeMonotoneCurveTangents(points: ColorCurvePoint[]): number[] {
  const pointCount = points.length

  if (pointCount === 0) {
    return []
  }

  if (pointCount === 1) {
    return [0]
  }

  const segmentWidths = new Array<number>(pointCount - 1)
  const slopes = new Array<number>(pointCount - 1)

  for (let index = 0; index < pointCount - 1; index += 1) {
    const pointA = points[index]!
    const pointB = points[index + 1]!
    const width = Math.max(pointB.x - pointA.x, Number.EPSILON)
    segmentWidths[index] = width
    slopes[index] = (pointB.y - pointA.y) / width
  }

  if (pointCount === 2) {
    return [slopes[0] ?? 0, slopes[0] ?? 0]
  }

  const tangents = new Array<number>(pointCount).fill(0)

  const startWidth = segmentWidths[0]!
  const nextWidth = segmentWidths[1]!
  const startSlope = slopes[0]!
  const nextSlope = slopes[1]!
  tangents[0] =
    ((2 * startWidth + nextWidth) * startSlope - startWidth * nextSlope) /
    (startWidth + nextWidth)

  if (tangents[0] * startSlope <= 0) {
    tangents[0] = 0
  } else if (
    startSlope * nextSlope < 0 &&
    Math.abs(tangents[0]) > Math.abs(startSlope * 3)
  ) {
    tangents[0] = startSlope * 3
  }

  for (let index = 1; index < pointCount - 1; index += 1) {
    const previousSlope = slopes[index - 1]!
    const nextSegmentSlope = slopes[index]!

    if (previousSlope === 0 || nextSegmentSlope === 0) {
      tangents[index] = 0
      continue
    }

    if (previousSlope * nextSegmentSlope < 0) {
      tangents[index] = 0
      continue
    }

    const previousWidth = segmentWidths[index - 1]!
    const nextSegmentWidth = segmentWidths[index]!
    const weightA = 2 * nextSegmentWidth + previousWidth
    const weightB = nextSegmentWidth + 2 * previousWidth

    tangents[index] =
      (weightA + weightB) /
      (weightA / previousSlope + weightB / nextSegmentSlope)
  }

  const previousWidth = segmentWidths[pointCount - 3]!
  const endWidth = segmentWidths[pointCount - 2]!
  const previousSlope = slopes[pointCount - 3]!
  const endSlope = slopes[pointCount - 2]!

  tangents[pointCount - 1] =
    ((2 * endWidth + previousWidth) * endSlope - endWidth * previousSlope) /
    (endWidth + previousWidth)

  const endTangent = tangents[pointCount - 1] ?? 0

  if (endTangent * endSlope <= 0) {
    tangents[pointCount - 1] = 0
  } else if (
    endSlope * previousSlope < 0 &&
    Math.abs(endTangent) > Math.abs(endSlope * 3)
  ) {
    tangents[pointCount - 1] = endSlope * 3
  }

  return tangents
}

export function evaluateCurve(points: ColorCurvePoint[], x: number): number {
  const normalizedPoints = normalizeCurvePoints(points)
  const tangents = computeMonotoneCurveTangents(normalizedPoints)
  return evaluatePreparedCurve(normalizedPoints, tangents, x).value
}

export function isIdentityCurve(points: ColorCurvePoint[]): boolean {
  const normalizedPoints = normalizeCurvePoints(points)

  if (normalizedPoints.length === 2) {
    const [startPoint, endPoint] = normalizedPoints
    return (
      startPoint?.x === 0 &&
      startPoint.y === 0 &&
      endPoint?.x === 1 &&
      endPoint.y === 1
    )
  }

  return false
}

export function areDefaultColorCurves(curves: SceneColorCurves): boolean {
  return COLOR_CURVE_CHANNELS.every((channelId) =>
    isIdentityCurve(curves[channelId].points)
  )
}

export function buildCurveLut(
  points: ColorCurvePoint[],
  size = 1024
): Float32Array {
  const data = new Float32Array(size * 4)
  const normalizedPoints = normalizeCurvePoints(points)
  const tangents = computeMonotoneCurveTangents(normalizedPoints)
  let segmentIndex = 1

  for (let index = 0; index < size; index += 1) {
    const t = index / Math.max(size - 1, 1)
    const sample = evaluatePreparedCurve(
      normalizedPoints,
      tangents,
      t,
      segmentIndex
    )
    const value = clamp01(sample.value)
    segmentIndex = sample.segmentIndex
    const offset = index * 4
    data[offset] = value
    data[offset + 1] = value
    data[offset + 2] = value
    data[offset + 3] = 1
  }

  return data
}

function evaluatePreparedCurve(
  points: ColorCurvePoint[],
  tangents: number[],
  x: number,
  hintSegmentIndex = 1
): { segmentIndex: number; value: number } {
  const clampedX = clamp01(x)

  if (clampedX <= 0) {
    return {
      segmentIndex: 1,
      value: points[0]?.y ?? 0,
    }
  }

  const lastPoint = points[points.length - 1]
  if (clampedX >= 1) {
    return {
      segmentIndex: Math.max(1, points.length - 1),
      value: lastPoint?.y ?? 1,
    }
  }

  const maxSegmentIndex = Math.max(1, points.length - 1)
  let segmentIndex = Math.min(Math.max(hintSegmentIndex, 1), maxSegmentIndex)

  while (
    segmentIndex < maxSegmentIndex &&
    clampedX > (points[segmentIndex]?.x ?? 1)
  ) {
    segmentIndex += 1
  }

  const pointA = points[segmentIndex - 1]!
  const pointB = points[segmentIndex]!
  const width = Math.max(pointB.x - pointA.x, Number.EPSILON)
  const t = (clampedX - pointA.x) / width
  const t2 = t * t
  const t3 = t2 * t
  const tangentA = tangents[segmentIndex - 1] ?? 0
  const tangentB = tangents[segmentIndex] ?? 0

  return {
    segmentIndex,
    value:
      (2 * t3 - 3 * t2 + 1) * pointA.y +
      (t3 - 2 * t2 + t) * width * tangentA +
      (-2 * t3 + 3 * t2) * pointB.y +
      (t3 - t2) * width * tangentB,
  }
}
