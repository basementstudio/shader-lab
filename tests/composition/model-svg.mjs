import * as THREE from "three/webgpu"
import { createLayer } from "@/lib/editor/layers"
import { useLayerStore } from "@/store/layer-store"
import { MODEL_ENVIRONMENTS } from "@/lib/editor/config/model-options"
import { getAssetAccept, isSvgMediaSource } from "@/lib/editor/media-file"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { describeModelLoadFailure } from "@/renderer/layer-media-error"
import { ModelPass } from "@/renderer/model-pass"
import { buildSvgModel, parseSvg } from "@/renderer/model-svg"
import { useAssetStore } from "@/store/asset-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
import { modelLayer } from "./model-layer.mjs"

function assert(value, label) {
  if (!value) throw new Error(label)
}
function near(actual, expected, tolerance, label) {
  assert(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: got ${actual}, expected ${expected} ± ${tolerance}`
  )
}
const N = 96

const RING = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#ff0000" fill-rule="evenodd" d="M10 50 A40 40 0 1 0 90 50 A40 40 0 1 0 10 50 Z M30 50 A20 20 0 1 0 70 50 A20 20 0 1 0 30 50 Z"/></svg>`
const STACK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" fill="#0000ff"/><rect x="25" y="25" width="50" height="50" fill="#ffffff"/></svg>`
const STROKE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polyline points="10,90 50,10 90,90" fill="none" stroke="#00ff00" stroke-width="10"/></svg>`
const FADED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ff0000" fill-opacity="0.5"/><polyline points="10,90 50,10 90,90" fill="none" stroke="#00ff00" stroke-width="10" stroke-opacity="0.25"/></svg>`
const TEXT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="50">Logo</text></svg>`

function boxOf(group) {
  group.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(group)
}

function hits(group, x, y) {
  const raycaster = new THREE.Raycaster(new THREE.Vector3(x, y, 1000), new THREE.Vector3(0, 0, -1))
  return raycaster.intersectObject(group, true).length > 0
}

function unitChecks() {
  const flat = { bevel: 0, bevelSegments: 4, depth: 0.2 }
  const ring = buildSvgModel(parseSvg(RING), flat)
  const ringBox = boxOf(ring)
  near(ringBox.max.x - ringBox.min.x, 80, 0.5, "The ring keeps its SVG width")
  near(ringBox.max.z - ringBox.min.z, 16, 0.05, "Depth is a share of the logo size")
  assert(hits(ring, 20, -50) && !hits(ring, 50, -50), "The ring's hole stays open")
  assert(ringBox.max.y <= 0.01 && ringBox.min.y < -80, "SVG's y-down axis is flipped to y-up")
  const beveled = boxOf(buildSvgModel(parseSvg(RING), { bevel: 0.02, bevelSegments: 4, depth: 0.2 }))
  near(beveled.max.x - beveled.min.x, 80, 0.5, "Bevel does not grow the outline")
  near(beveled.max.z - beveled.min.z, 16 + 3.2, 0.05, "Bevel adds to the front and back")
  const materials = new Set()
  ring.traverse((object) => {
    if (object.isMesh) materials.add(object.material)
  })
  const [material] = materials
  assert(material.color.r > 0.9 && material.color.g < 0.1, "Fill color becomes the material")
  const stacked = buildSvgModel(parseSvg(STACK), flat)
  const [back, front] = stacked.children
  assert(stacked.children.length === 2, "Each SVG path becomes a mesh")
  assert(boxOf(front).max.z > boxOf(back).max.z, "Later paths sit in front, so overlaps do not flicker")
  const stroke = buildSvgModel(parseSvg(STROKE), flat)
  const strokeBox = boxOf(stroke)
  near(
    (strokeBox.max.z - strokeBox.min.z) /
      Math.max(strokeBox.max.x - strokeBox.min.x, strokeBox.max.y - strokeBox.min.y),
    0.2,
    0.002,
    "Strokes extrude by the same share of the logo size"
  )
  assert(hits(stroke, 50, -14) && !hits(stroke, 50, -60), "Stroke-only shapes become solid lines")
  const faded = buildSvgModel(parseSvg(FADED), flat)
  const [fadedFill, fadedStroke] = faded.children
  assert(
    fadedFill.material.transparent && Math.abs(fadedFill.material.opacity - 0.5) < 1e-6,
    "Fill opacity becomes material opacity"
  )
  assert(
    fadedStroke.material.transparent && Math.abs(fadedStroke.material.opacity - 0.25) < 1e-6,
    "Stroke opacity becomes material opacity"
  )
  assert(!ring.children[0].material.transparent, "Opaque shapes stay opaque")
  let error = ""
  try {
    buildSvgModel(parseSvg(TEXT), flat)
  } catch (cause) {
    error = describeModelLoadFailure("logo.svg", cause)
  }
  assert(error.includes("Convert text to outlines"), `Text-only SVGs explain what to do (${error})`)
  assert(getAssetAccept("model").includes(".svg"), "The 3D Model picker accepts .svg")
  return 17
}

async function passChecks(reopened) {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const input = new THREE.DataTexture(new Float32Array([0, 0, 1, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const pass = new ModelPass("model-svg", renderer)
  pass.updateCompositionRole("source")
  pass.flushColorNode()
  pass.resize(N, N)
  pass.updateLogicalSize(N, N)
  pass.updateOpacity(1)
  const ringUrl = URL.createObjectURL(new Blob([RING], { type: "image/svg+xml" }))
  const render = async (params = {}, asset = null) => {
    pass.updateParams({
      ...createLayer("model").params,
      floor: false,
      orbit: 0,
      elevation: 0,
      toneMapping: "none",
      ...params,
    })
    await pass.setEnvironment(MODEL_ENVIRONMENTS[0].url)
    await pass.setModel({ format: "svg", url: asset ? asset.url : ringUrl })
    await pass.whenCompiled()
    pass.render(renderer, input, target, 0, 0)
    pass.render(renderer, input, target, 0, 0)
    return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
  }
  const covered = (pixels, column, row) => {
    const i = (row * N + column) * 4
    return !(pixels[i] < 0.05 && pixels[i + 1] < 0.05 && pixels[i + 2] > 0.95)
  }
  const width = (pixels) => {
    let left = N
    let right = -1
    for (let row = 0; row < N; row++) {
      for (let column = 0; column < N; column++) {
        if (covered(pixels, column, row)) {
          left = Math.min(left, column)
          right = Math.max(right, column)
        }
      }
    }
    return right - left + 1
  }
  let samples = 0
  try {
    if (reopened) {
      const restored = await render(
        { ...reopened.params, floor: false, orbit: 0, elevation: 0, toneMapping: "none" },
        reopened.asset
      )
      assert(covered(restored, Math.round(N * 0.2), N / 2), "The reopened project renders its SVG asset")
      assert(!covered(restored, N / 2, N / 2), "The reopened SVG keeps its hole")
      return 2
    }
    const front = await render({ material: "clay" })
    assert(!covered(front, N / 2, N / 2), "The hole in the middle shows the layers below")
    assert(covered(front, Math.round(N * 0.2), N / 2), "The ring itself is solid")
    samples += 2
    const thin = width(await render({ material: "clay", rotation: [0, 89, 0], extrudeDepth: 0.05 }))
    const thick = width(await render({ material: "clay", rotation: [0, 89, 0], extrudeDepth: 0.6 }))
    assert(thin > 0 && thick > thin + 4, `Seen side-on, a deeper extrusion is wider (${thin} → ${thick})`)
    samples++
    const chrome = await render({ material: "chrome", extrudeDepth: 0.3 })
    assert(covered(chrome, Math.round(N * 0.2), N / 2), "Replacement materials work on SVG models")
    assert(pass.getOutputSceneDepth() !== null, "SVG models expose their depth")
    samples += 2
  } finally {
    pass.dispose()
    target.dispose()
    input.dispose()
    renderer.dispose()
  }
  return samples
}

function projectChecks() {
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [{ id: "logo", fileName: "logo.svg", kind: "model", mimeType: "image/svg+xml" }],
    layers: [
      {
        ...modelLayer("logo"),
        id: "logo-layer",
        params: {
          ...createLayer("model").params,
          extrudeBevel: 0.03,
          extrudeBevelSegments: 6,
          extrudeDepth: 0.4,
        },
      },
    ],
    selectedLayerId: "logo-layer",
    composition: { width: 64, height: 64 },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 2, loop: true, tracks: [] },
  }
  const asset = {
    createdAt: new Date(0).toISOString(),
    duration: null,
    error: null,
    fileName: "logo.svg",
    height: null,
    id: "logo",
    kind: "model",
    mimeType: "image/svg+xml",
    sizeBytes: RING.length,
    source: "local",
    status: "ready",
    url: URL.createObjectURL(new Blob([RING], { type: "image/svg+xml" })),
    width: null,
  }
  useAssetStore.getState().replaceAssets([asset])
  applyLabProjectFile(parseLabProjectFileValue(project), [asset])
  const saved = parseLabProjectFileValue(JSON.parse(JSON.stringify(buildLabProjectFile())))
  assert(saved.assets.some((entry) => entry.id === "logo"), "The saved project references the SVG asset")
  const missing = applyLabProjectFile(saved, [asset])
  const layer = useLayerStore.getState().getLayerById("logo-layer")
  assert(missing.missingAssetCount === 0 && layer.assetId === "logo" && !layer.runtimeError, "The SVG asset resolves after reopen")
  const params = saved.layers.find((entry) => entry.id === "logo-layer").params
  assert(params.extrudeDepth === 0.4 && params.extrudeBevel === 0.03 && params.extrudeBevelSegments === 6, "Extrude settings survive save and reopen")
  const defaults = createLayer("model").params
  assert(defaults.extrudeDepth === 0.15 && defaults.extrudeBevel === 0.02 && defaults.extrudeBevelSegments === 4, "Default extrusion")
  return { asset, params: layer.params, samples: 4 }
}

export async function checkModelSvg() {
  let samples = unitChecks()
  const reopened = projectChecks()
  samples += reopened.samples
  samples += await passChecks(null)
  samples += await passChecks(reopened)
  return samples
}
