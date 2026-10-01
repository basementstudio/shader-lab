import * as THREE from "three/webgpu"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { type GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js"
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"

const DRACO_PATH = "/three/draco/"
const BASIS_PATH = "/three/basis/"

let dracoLoader: DRACOLoader | null = null
const ktx2Loaders = new WeakMap<object, KTX2Loader>()

function ktx2LoaderFor(renderer: THREE.WebGPURenderer): KTX2Loader {
  let loader = ktx2Loaders.get(renderer)
  if (!loader) {
    loader = new KTX2Loader().setTranscoderPath(BASIS_PATH)
    loader.detectSupport(renderer as never)
    ktx2Loaders.set(renderer, loader)
  }
  return loader
}

export async function loadGltf(
  url: string,
  renderer: THREE.WebGPURenderer
): Promise<GLTF> {
  dracoLoader ??= new DRACOLoader().setDecoderPath(DRACO_PATH)
  const loader = new GLTFLoader()
  loader.setDRACOLoader(dracoLoader)
  loader.setKTX2Loader(ktx2LoaderFor(renderer))
  loader.setMeshoptDecoder(MeshoptDecoder)
  return loader.loadAsync(url)
}

const TARGET_IRRADIANCE = 0.6

function meanLuminance(texture: THREE.DataTexture): number {
  const { data, height, width } = texture.image as {
    data: ArrayLike<number>
    height: number
    width: number
  }
  const half = texture.type === THREE.HalfFloatType
  const read = (index: number) => {
    const value = data[index] ?? 0
    return half ? THREE.DataUtils.fromHalfFloat(value) : value
  }
  const step = Math.max(1, Math.round(Math.max(width, height) / 256))
  let total = 0
  let weight = 0
  for (let y = 0; y < height; y += step) {
    const solidAngle = Math.sin(((y + 0.5) / height) * Math.PI)
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4
      const luminance =
        read(index) * 0.2126 + read(index + 1) * 0.7152 + read(index + 2) * 0.0722
      if (Number.isFinite(luminance)) {
        total += luminance * solidAngle
        weight += solidAngle
      }
    }
  }
  return weight > 0 ? total / weight : 0
}

export async function loadEnvironment(
  url: string
): Promise<{ normalization: number; texture: THREE.DataTexture }> {
  const texture = (await new HDRLoader().loadAsync(url)) as THREE.DataTexture
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.needsUpdate = true
  const mean = meanLuminance(texture)
  const normalization =
    mean > 0 ? Math.min(50, Math.max(0.02, TARGET_IRRADIANCE / mean)) : 1
  return { normalization, texture }
}
