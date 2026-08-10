const INF = 1e20

function edt1d(
  grid: Float64Array,
  offset: number,
  stride: number,
  length: number,
  f: Float64Array,
  v: Int32Array,
  z: Float64Array
): void {
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  f[0] = grid[offset] ?? 0

  let k = 0
  let s = 0

  for (let q = 1; q < length; q += 1) {
    f[q] = grid[offset + q * stride] ?? 0
    const q2 = q * q

    for (;;) {
      const r = v[k] ?? 0
      s = ((f[q] ?? 0) - (f[r] ?? 0) + q2 - r * r) / (q - r) / 2

      if (s > (z[k] ?? 0)) {
        break
      }

      k -= 1

      if (k <= -1) {
        break
      }
    }

    k += 1
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }

  k = 0

  for (let q = 0; q < length; q += 1) {
    while ((z[k + 1] ?? 0) < q) {
      k += 1
    }

    const r = v[k] ?? 0
    const qr = q - r
    grid[offset + q * stride] = (f[r] ?? 0) + qr * qr
  }
}

function edt2d(
  data: Float64Array,
  width: number,
  height: number,
  f: Float64Array,
  v: Int32Array,
  z: Float64Array
): void {
  for (let x = 0; x < width; x += 1) {
    edt1d(data, x, width, height, f, v, z)
  }

  for (let y = 0; y < height; y += 1) {
    edt1d(data, y * width, 1, width, f, v, z)
  }
}

export function computeSignedDistanceField(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray {
  const size = width * height
  const gridOuter = new Float64Array(size)
  const gridInner = new Float64Array(size)
  const scratchLength = Math.max(width, height)
  const f = new Float64Array(scratchLength)
  const v = new Int32Array(scratchLength)
  const z = new Float64Array(scratchLength + 1)

  for (let index = 0; index < size; index += 1) {
    const coverage = (alpha[index] ?? 0) / 255

    if (coverage >= 1) {
      gridOuter[index] = 0
      gridInner[index] = INF
      continue
    }

    if (coverage <= 0) {
      gridOuter[index] = INF
      gridInner[index] = 0
      continue
    }

    const outer = Math.max(0, 0.5 - coverage)
    const inner = Math.max(0, coverage - 0.5)
    gridOuter[index] = outer * outer
    gridInner[index] = inner * inner
  }

  edt2d(gridOuter, width, height, f, v, z)
  edt2d(gridInner, width, height, f, v, z)

  const field = new Uint8ClampedArray(size)
  const safeRadius = Math.max(1, radius)

  for (let index = 0; index < size; index += 1) {
    const distance =
      Math.sqrt(gridOuter[index] ?? 0) - Math.sqrt(gridInner[index] ?? 0)
    field[index] = Math.round(255 * (0.5 - distance / safeRadius))
  }

  return field
}
