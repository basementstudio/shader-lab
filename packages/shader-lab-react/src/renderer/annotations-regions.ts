export const MAX_ANNOTATION_REGIONS = 16
const CLUSTERS = 5
const BOUNDARY_POINTS = 256
const CHROMA_WEIGHT = 1.4

export type AnnotationRegion = {
  id: number
  area: number
  u: number
  v: number
  u0: number
  v0: number
  u1: number
  v1: number
  cuu: number
  cuv: number
  cvv: number
  tone: number
  boundary: Float32Array
}

export type AnnotationRegions = {
  width: number
  height: number
  regions: AnnotationRegion[]
  labels: Int16Array
  centers: Float32Array
  nextId: number
}

function blurFeatures(width: number, height: number, color: Float32Array): Float32Array {
  const feature = new Float32Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let l = 0
      let a = 0
      let b = 0
      let count = 0
      for (let dy = -1; dy <= 1; dy++) {
        const sy = y + dy
        if (sy < 0 || sy >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const sx = x + dx
          if (sx < 0 || sx >= width) continue
          const index = (sy * width + sx) * 3
          l += color[index] ?? 0
          a += color[index + 1] ?? 0
          b += color[index + 2] ?? 0
          count++
        }
      }
      const out = (y * width + x) * 3
      feature[out] = l / count
      feature[out + 1] = ((a / count) * 2 - 1) * CHROMA_WEIGHT
      feature[out + 2] = ((b / count) * 2 - 1) * CHROMA_WEIGHT
    }
  }
  return feature
}

function initialCenters(feature: Float32Array, cells: number): Float32Array {
  const order = Array.from({ length: cells }, (_, index) => index)
  order.sort((p, q) => (feature[p * 3] ?? 0) - (feature[q * 3] ?? 0) || p - q)
  const centers = new Float32Array(CLUSTERS * 3)
  for (let k = 0; k < CLUSTERS; k++) {
    const cell = order[Math.min(cells - 1, Math.floor(((k + 0.5) / CLUSTERS) * cells))] ?? 0
    centers[k * 3] = feature[cell * 3] ?? 0
    centers[k * 3 + 1] = feature[cell * 3 + 1] ?? 0
    centers[k * 3 + 2] = feature[cell * 3 + 2] ?? 0
  }
  return centers
}

function cluster(feature: Float32Array, cells: number, centers: Float32Array, iterations: number): Uint8Array {
  const assign = new Uint8Array(cells)
  const sums = new Float64Array(CLUSTERS * 4)
  for (let iteration = 0; iteration <= iterations; iteration++) {
    sums.fill(0)
    for (let i = 0; i < cells; i++) {
      const l = feature[i * 3] ?? 0
      const a = feature[i * 3 + 1] ?? 0
      const b = feature[i * 3 + 2] ?? 0
      let best = 0
      let bestDistance = Number.POSITIVE_INFINITY
      for (let k = 0; k < CLUSTERS; k++) {
        const dl = l - (centers[k * 3] ?? 0)
        const da = a - (centers[k * 3 + 1] ?? 0)
        const db = b - (centers[k * 3 + 2] ?? 0)
        const distance = dl * dl + da * da + db * db
        if (distance < bestDistance) {
          bestDistance = distance
          best = k
        }
      }
      assign[i] = best
      sums[best * 4] = (sums[best * 4] ?? 0) + l
      sums[best * 4 + 1] = (sums[best * 4 + 1] ?? 0) + a
      sums[best * 4 + 2] = (sums[best * 4 + 2] ?? 0) + b
      sums[best * 4 + 3] = (sums[best * 4 + 3] ?? 0) + 1
    }
    if (iteration === iterations) break
    for (let k = 0; k < CLUSTERS; k++) {
      const count = sums[k * 4 + 3] ?? 0
      if (count <= 0) continue
      centers[k * 3] = (sums[k * 4] ?? 0) / count
      centers[k * 3 + 1] = (sums[k * 4 + 1] ?? 0) / count
      centers[k * 3 + 2] = (sums[k * 4 + 2] ?? 0) / count
    }
  }
  return assign
}

function majority(width: number, height: number, labels: Uint8Array): Uint8Array {
  const next = new Uint8Array(labels.length)
  const votes = new Uint8Array(CLUSTERS)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      votes.fill(0)
      for (let dy = -1; dy <= 1; dy++) {
        const sy = y + dy
        if (sy < 0 || sy >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const sx = x + dx
          if (sx < 0 || sx >= width) continue
          const label = labels[sy * width + sx] ?? 0
          votes[label] = (votes[label] ?? 0) + 1
        }
      }
      const own = labels[y * width + x] ?? 0
      let best = own
      for (let k = 0; k < CLUSTERS; k++) if ((votes[k] ?? 0) > (votes[best] ?? 0)) best = k
      next[y * width + x] = best
    }
  }
  return next
}

function components(width: number, height: number, labels: Uint8Array) {
  const cells = width * height
  const component = new Int32Array(cells).fill(-1)
  const stack = new Int32Array(cells)
  const sizes: number[] = []
  for (let start = 0; start < cells; start++) {
    if ((component[start] ?? 0) >= 0) continue
    const id = sizes.length
    const label = labels[start]
    let top = 0
    let size = 0
    stack[top++] = start
    component[start] = id
    while (top > 0) {
      const cell = stack[--top] ?? 0
      size++
      const x = cell % width
      for (let side = 0; side < 4; side++) {
        let next = -1
        if (side === 0 && x > 0) next = cell - 1
        else if (side === 1 && x < width - 1) next = cell + 1
        else if (side === 2 && cell >= width) next = cell - width
        else if (side === 3 && cell < cells - width) next = cell + width
        if (next >= 0 && (component[next] ?? 0) < 0 && labels[next] === label) {
          component[next] = id
          stack[top++] = next
        }
      }
    }
    sizes.push(size)
  }
  return { component, sizes }
}

export function segmentAnnotationRegions(
  width: number,
  height: number,
  color: Float32Array,
  previous: AnnotationRegions | null
): AnnotationRegions {
  const cells = width * height
  const feature = blurFeatures(width, height, color)
  const warm =
    previous &&
    previous.width === width &&
    previous.height === height &&
    previous.centers.length === CLUSTERS * 3
  const centers = warm ? Float32Array.from(previous.centers) : initialCenters(feature, cells)
  const labels = majority(width, height, majority(width, height, cluster(feature, cells, centers, warm ? 3 : 8)))
  const { component, sizes } = components(width, height, labels)
  const minCells = Math.max(12, Math.round(cells * 0.003))
  const rims = new Int32Array(sizes.length)
  for (let i = 0; i < cells; i++) {
    const c = component[i] ?? 0
    const x = i % width
    if (
      (x > 0 && component[i - 1] !== c) ||
      (x < width - 1 && component[i + 1] !== c) ||
      (i >= width && component[i - width] !== c) ||
      (i < cells - width && component[i + width] !== c)
    )
      rims[c] = (rims[c] ?? 0) + 1
  }
  const candidates = new Uint8Array(sizes.length)
  for (let c = 0; c < sizes.length; c++) {
    const size = sizes[c] ?? 0
    if (size >= minCells * 0.5 && size >= (rims[c] ?? 0) * 1.8) candidates[c] = 1
  }

  const matched = new Map<number, number>()
  if (warm && previous) {
    const previousSize = new Map<number, number>()
    for (const region of previous.regions) previousSize.set(region.id, Math.round(region.area * cells))
    const overlap = new Map<number, number>()
    for (let i = 0; i < cells; i++) {
      const c = component[i] ?? 0
      const before = previous.labels[i] ?? 0
      if (!candidates[c] || before <= 0) continue
      const key = c * 65536 + before
      overlap.set(key, (overlap.get(key) ?? 0) + 1)
    }
    const pairs: [number, number, number][] = []
    for (const [key, count] of overlap) {
      const c = Math.floor(key / 65536)
      const before = key % 65536
      const union = (sizes[c] ?? 0) + (previousSize.get(before) ?? 0) - count
      const iou = union > 0 ? count / union : 0
      if (iou >= 0.25) pairs.push([iou, c, before])
    }
    pairs.sort((p, q) => q[0] - p[0] || p[1] - q[1] || p[2] - q[2])
    const taken = new Set<number>()
    for (const [, c, before] of pairs) {
      if (matched.has(c) || taken.has(before)) continue
      matched.set(c, before)
      taken.add(before)
    }
  }

  const kept: number[] = []
  for (let c = 0; c < sizes.length; c++) {
    if (!candidates[c]) continue
    if (matched.has(c) || (sizes[c] ?? 0) >= minCells) kept.push(c)
  }
  kept.sort((p, q) => (sizes[q] ?? 0) - (sizes[p] ?? 0) || p - q)
  kept.length = Math.min(kept.length, MAX_ANNOTATION_REGIONS)
  let nextId = warm && previous ? previous.nextId : 1
  const idOf = new Map<number, number>()
  for (const c of kept) {
    const id = matched.get(c)
    if (id !== undefined) idOf.set(c, id)
    else idOf.set(c, nextId++)
  }
  if (nextId > 30000) nextId = 1

  const persistent = new Int16Array(cells)
  const stats = new Map<number, number[]>()
  for (const c of kept) stats.set(c, [0, 0, 0, 0, 0, 0, 0, width, height, -1, -1])
  const boundaries = new Map<number, number[]>()
  for (const c of kept) boundaries.set(c, [])
  for (let i = 0; i < cells; i++) {
    const c = component[i] ?? 0
    const entry = stats.get(c)
    if (!entry) continue
    persistent[i] = idOf.get(c) ?? 0
    const x = i % width
    const y = (i - x) / width
    const u = (x + 0.5) / width
    const v = (y + 0.5) / height
    entry[0] = (entry[0] ?? 0) + 1
    entry[1] = (entry[1] ?? 0) + u
    entry[2] = (entry[2] ?? 0) + v
    entry[3] = (entry[3] ?? 0) + u * u
    entry[4] = (entry[4] ?? 0) + u * v
    entry[5] = (entry[5] ?? 0) + v * v
    entry[6] = (entry[6] ?? 0) + (color[i * 3] ?? 0)
    entry[7] = Math.min(entry[7] ?? width, x)
    entry[8] = Math.min(entry[8] ?? height, y)
    entry[9] = Math.max(entry[9] ?? -1, x)
    entry[10] = Math.max(entry[10] ?? -1, y)
    const edge =
      (x > 0 && component[i - 1] !== c) ||
      (x < width - 1 && component[i + 1] !== c) ||
      (y > 0 && component[i - width] !== c) ||
      (y < height - 1 && component[i + width] !== c)
    if (edge) boundaries.get(c)?.push(i)
  }

  const regions: AnnotationRegion[] = []
  for (const c of kept) {
    const entry = stats.get(c) ?? []
    const count = entry[0] ?? 1
    const u = (entry[1] ?? 0) / count
    const v = (entry[2] ?? 0) / count
    const edgeCells = boundaries.get(c) ?? []
    const stride = Math.max(1, Math.ceil(edgeCells.length / BOUNDARY_POINTS))
    const points: number[] = []
    for (let k = 0; k < edgeCells.length; k += stride) {
      const cell = edgeCells[k] ?? 0
      const x = cell % width
      points.push((x + 0.5) / width, ((cell - x) / width + 0.5) / height)
    }
    regions.push({
      id: idOf.get(c) ?? 0,
      area: count / cells,
      u,
      v,
      u0: (entry[7] ?? 0) / width,
      v0: (entry[8] ?? 0) / height,
      u1: ((entry[9] ?? 0) + 1) / width,
      v1: ((entry[10] ?? 0) + 1) / height,
      cuu: Math.max(0, (entry[3] ?? 0) / count - u * u),
      cuv: (entry[4] ?? 0) / count - u * v,
      cvv: Math.max(0, (entry[5] ?? 0) / count - v * v),
      tone: (entry[6] ?? 0) / count,
      boundary: Float32Array.from(points),
    })
  }
  regions.sort((p, q) => p.id - q.id)
  return { width, height, regions, labels: persistent, centers, nextId }
}

export function edgeTangents(width: number, height: number, color: Float32Array): Float32Array {
  const angle = new Float32Array(width * height)
  const luma = (x: number, y: number) =>
    color[(Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 3] ?? 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        luma(x + 1, y - 1) + 2 * luma(x + 1, y) + luma(x + 1, y + 1) -
        luma(x - 1, y - 1) - 2 * luma(x - 1, y) - luma(x - 1, y + 1)
      const gy =
        luma(x - 1, y + 1) + 2 * luma(x, y + 1) + luma(x + 1, y + 1) -
        luma(x - 1, y - 1) - 2 * luma(x, y - 1) - luma(x + 1, y - 1)
      angle[y * width + x] = Math.atan2(gy, gx) + Math.PI / 2
    }
  }
  return angle
}
