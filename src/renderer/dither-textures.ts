import * as THREE from "three/webgpu"

const BAYER_2X2 = [0, 2, 3, 1] as const

const BAYER_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
] as const

const BAYER_8X8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
] as const

function buildBayerTexture(values: readonly number[], size: number): THREE.DataTexture {
  const normalizer = size * size
  const data = new Uint8Array(size * size * 4)

  for (let index = 0; index < size * size; index += 1) {
    const channel = Math.round(((values[index] ?? 0) / normalizer) * 255)
    const offset = index * 4
    data[offset] = channel
    data[offset + 1] = channel
    data[offset + 2] = channel
    data[offset + 3] = 255
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  )
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.needsUpdate = true

  return texture
}

function buildBlueNoiseTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  const fract = (value: number) => value - Math.floor(value)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const noise = Math.round(
        fract(52.9829189 * fract(0.06711056 * x + 0.00583715 * y)) * 255,
      )
      const offset = (y * size + x) * 4
      data[offset] = noise
      data[offset + 1] = noise
      data[offset + 2] = noise
      data[offset + 3] = 255
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  )
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.needsUpdate = true

  return texture
}

export interface DitherTextures {
  bayer2: THREE.DataTexture
  bayer4: THREE.DataTexture
  bayer8: THREE.DataTexture
  noise: THREE.DataTexture
}

export function buildDitherTextures(): DitherTextures {
  return {
    bayer2: buildBayerTexture(BAYER_2X2, 2),
    bayer4: buildBayerTexture(BAYER_4X4, 4),
    bayer8: buildBayerTexture(BAYER_8X8, 8),
    noise: buildBlueNoiseTexture(),
  }
}
