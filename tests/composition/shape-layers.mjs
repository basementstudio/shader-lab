import { ShapePass as RuntimeShapePass } from "@runtime/renderer/shape-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { SHAPE_KINDS, ShapePass } from "@/renderer/shape-pass"
import { createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildShaderExportConfig } from "@/lib/editor/shader-export"
import {
  applyEditorHistorySnapshot,
  buildEditorHistorySnapshot,
} from "@/lib/editor/history"
import { getLayerCatalogEntry } from "@/lib/editor/config/layer-catalog"
import { useLayerStore } from "@/store/layer-store"
import { DEFAULT_LAYER_MASK, DEFAULT_SCENE_CONFIG } from "@/types/editor"

function assert(value, label) {
  if (!value) throw new Error(label)
}
function close(actual, expected, label, tolerance = 0.01) {
  assert(actual.length === expected.length, `${label}: wrong size`)
  actual.forEach((value, i) => {
    assert(
      Number.isFinite(value) && Math.abs(value - expected[i]) <= tolerance,
      `${label}: ${i} got ${value}, expected ${expected[i]}`
    )
  })
}
const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const N = 96
const index = (v) => Math.min(N - 1, Math.max(0, Math.round((v + 0.5) * N - 0.5)))
const RED = [linear(1), linear(0x4a / 255), linear(0x2a / 255)]

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const backdrop = [0, 0, 1, 1]
  const input = new THREE.DataTexture(new Float32Array(backdrop), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", ShapePass],
      ["runtime", RuntimeShapePass],
    ]) {
      const pass = new Pass(`shape-${name}`)
      pass.updateCompositionRole("source")
      const render = async (params, blend = "normal") => {
        pass.updateBlendMode(blend)
        pass.flushColorNode()
        pass.resize(N, N)
        pass.updateLogicalSize(N, N)
        pass.updateParams({ ...createLayer("shape").params, ...params })
        pass.updateOpacity(1)
        pass.render(renderer, input, target, 0, 0)
        const pixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
        return (x, y) => {
          const i = (index(y) * N + index(x)) * 4
          return pixels.slice(i, i + 4)
        }
      }
      const check = (label, actual, expected, tolerance) => {
        close(actual, expected, `${name}: ${label}`, tolerance)
        results[label] ??= {}
        results[label][name] = actual
        samples++
      }
      const coverage = (at, x, y) => at(x, y)[0] / RED[0]
      let at = await render({ shape: "ellipse", size: [0.6, 0.6] })
      check("ellipse center", at(0, 0), [...RED, 1], 0.02)
      check("ellipse inside", at(0.25, 0), [...RED, 1], 0.02)
      check("ellipse outside", at(0.35, 0), backdrop, 0.02)
      check("ellipse corner", at(0.4, 0.4), backdrop, 0.02)
      at = await render({ shape: "ellipse", size: [0.6, 0.3] })
      check("ellipse height", at(0, 0.2), backdrop, 0.02)
      at = await render({ shape: "ellipse", size: [0.6, 0.3], rotation: 90 })
      check("rotated ellipse", at(0, 0.2), [...RED, 1], 0.02)
      check("rotated ellipse side", at(0.2, 0), backdrop, 0.02)
      at = await render({ shape: "ellipse", size: [0.4, 0.4], center: [0.25, -0.2] })
      check("offset ellipse", at(0.25, -0.2), [...RED, 1], 0.02)
      check("offset ellipse origin", at(0, 0), backdrop, 0.02)

      at = await render({ shape: "rectangle", size: [0.6, 0.4], cornerRadius: 0 })
      check("rectangle corner filled", at(0.28, 0.18), [...RED, 1], 0.02)
      check("rectangle outside", at(0.32, 0), backdrop, 0.02)
      at = await render({ shape: "rectangle", size: [0.6, 0.4], cornerRadius: 1 })
      check("rounded corner cut", at(0.28, 0.18), backdrop, 0.02)
      check("rounded center", at(0, 0), [...RED, 1], 0.02)

      at = await render({ shape: "triangle", size: [0.8, 0.8] })
      check("triangle apex column", at(0, -0.3), [...RED, 1], 0.02)
      check("triangle empty top corner", at(0.3, -0.3), backdrop, 0.02)
      check("triangle base", at(0.3, 0.15), [...RED, 1], 0.02)

      at = await render({ shape: "polygon", size: [0.8, 0.8], sides: 6 })
      const hexEdge = coverage(at, 0.33, 0)
      at = await render({ shape: "polygon", size: [0.8, 0.8], sides: 3 })
      const triEdge = coverage(at, 0.33, 0)
      assert(hexEdge > 0.9 && triEdge < 0.1, `${name}: polygon sides change the silhouette (${hexEdge}, ${triEdge})`)
      samples++

      at = await render({ shape: "star", size: [0.8, 0.8], points: 5, innerRadius: 0.4 })
      check("star tip", at(0, -0.36), [...RED, 1], 0.02)
      assert(coverage(at, 0, 0.36) < 0.1, `${name}: star valley opposite the tip`)
      assert(coverage(at, 0, 0) > 0.9, `${name}: star core`)
      samples += 2

      at = await render({ shape: "ring", size: [0.8, 0.8], thickness: 0.3 })
      check("ring hole", at(0, 0), backdrop, 0.02)
      check("ring band", at(0.34, 0), [...RED, 1], 0.02)

      at = await render({ shape: "blades", size: [0.9, 0.9], blades: 4, twist: 0, bladeWidth: 0.55, hub: 0.12 })
      const bladeAxis = coverage(at, 0, -0.35)
      const bladeGap = coverage(at, 0.25, -0.25)
      assert(bladeAxis > 0.9 && bladeGap < 0.1, `${name}: four blades leave gaps at 45° (${bladeAxis}, ${bladeGap})`)
      check("blades hub", at(0, 0), [...RED, 1], 0.02)

      at = await render({ shape: "ellipse", size: [0.6, 0.6], outline: 0.05 })
      check("outline hole", at(0, 0), backdrop, 0.02)
      check("outline edge", at(0.29, 0), [...RED, 1], 0.02)

      at = await render({ shape: "ellipse", size: [0.6, 0.6], softness: 0.1 })
      const soft = coverage(at, 0.3, 0)
      assert(soft > 0.3 && soft < 0.7, `${name}: softness feathers the edge (${soft})`)
      check("soft interior", at(0, 0), [...RED, 1], 0.02)
      samples++

      at = await render({ shape: "ellipse", size: [0.6, 0.6], color: "#00ff00" })
      check("color", at(0, 0), [0, 1, 0, 1], 0.02)

      at = await render({ shape: "ellipse", size: [0.6, 0.6] }, "multiply")
      check("multiply over blue", at(0, 0), [0, 0, RED[2], 1], 0.02)
      check("multiply outside untouched", at(0.4, 0.4), backdrop, 0.02)

      pass.dispose()
    }
    for (const [label, entry] of Object.entries(results))
      close(entry.editor, entry.runtime, `parity: ${label}`, 0.002)
    samples += Object.keys(results).length
  } finally {
    target.dispose()
    input.dispose()
    renderer.dispose()
  }
  return samples
}

function solid(id, color) {
  const layer = createLayer("gradient")
  return {
    ...layer,
    id,
    params: {
      ...layer.params,
      animate: false,
      tonemapMode: "none",
      grainAmount: 0,
      glowStrength: 0,
      vignetteStrength: 0,
      ...Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`point${i}Color`, color])),
    },
  }
}

async function runtimeRender(config) {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  const compiling = []
  const compile = renderer.compileAsync.bind(renderer)
  renderer.compileAsync = (...args) => {
    const pending = compile(...args)
    compiling.push(pending)
    return pending
  }
  const headless = createHeadlessRenderer({ renderer, size: config.composition })
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const material = new THREE.MeshBasicNodeMaterial({ blending: THREE.NoBlending })
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
  try {
    await headless.initialize()
    const frame = runtimeFrame(config, 0, 0, 1, config.composition)
    headless.render(frame)
    while (compiling.length) await Promise.all(compiling.splice(0))
    material.colorNode = texture(headless.render(frame), vec2(uv().x, float(1).sub(uv().y)))
    renderer.setRenderTarget(target)
    renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
    return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
  } finally {
    headless.dispose()
    target.dispose()
    renderer.dispose()
  }
}

export async function checkShapeLayers(renderProject) {
  assert(SHAPE_KINDS.length === 7, "Seven shape kinds")
  assert(getLayerCatalogEntry("shape").label === "Shape", "Catalog entry")
  const fresh = createLayer("shape")
  assert(fresh.kind === "source" && fresh.params.shape === "ellipse" && fresh.params.color === "#ff4a2a", "New shape defaults")
  let samples = 3
  samples += await passChecks()

  const shape = {
    ...createLayer("shape"),
    id: "shape",
    blendMode: "multiply",
    params: { ...createLayer("shape").params, shape: "blades", size: [0.8, 0.8], center: [0.1, 0], rotation: 20 },
    mask: { ...DEFAULT_LAYER_MASK, shape: "rectangle", size: [2, 0.6], feather: 0 },
  }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [shape, solid("photo", "#8899ff")],
    selectedLayerId: shape.id,
    composition: { width: N, height: N },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const store = () => useLayerStore.getState()
  const before = buildEditorHistorySnapshot()
  store().updateLayerParam(shape.id, "shape", "star")
  store().updateLayerParam(shape.id, "center", [0.3, 0.3])
  applyEditorHistorySnapshot(before)
  assert(
    store().getLayerById(shape.id).params.shape === "blades" &&
      store().getLayerById(shape.id).params.center[0] === 0.1,
    "History lost shape settings"
  )
  const duplicateId = store().duplicateLayer(shape.id)
  store().updateLayerParam(duplicateId, "rotation", 90)
  assert(store().getLayerById(shape.id).params.rotation === 20, "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedShape = reopened.layers.find((l) => l.id === shape.id)
  assert(
    reopenedShape.type === "shape" &&
      reopenedShape.params.shape === "blades" &&
      reopenedShape.blendMode === "multiply" &&
      reopenedShape.mask.shape === "rectangle",
    "Save/reopen changed the shape layer"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === shape.id).type === "shape", "Shader export type")
  samples += 4

  const first = await renderProject(saved)
  const at = (image, x, y) => {
    const i = (index(y) * N + index(x)) * 4
    return Array.from(image.data.slice(i, i + 4))
  }
  const hub = at(first.image, 0.1, 0)
  const outsideMask = at(first.image, 0.1, 0.42)
  assert(hub[2] < 120 && hub[0] > 100, `Multiplied blades tint the photo at the hub (${hub})`)
  close(outsideMask, [0x88, 0x99, 0xff, 255], "Rectangle mask removes the shape outside its band", 2)
  const restored = await renderProject(reopened)
  close(Array.from(restored.image.data), Array.from(first.image.data), "Reopened pixels", 0)
  const runtimePixels = await runtimeRender(config)
  close(
    runtimePixels,
    Array.from(first.image.data, (value, i) => {
      const v = value / 255
      return i % 4 === 3 ? v : linear(v)
    }),
    "Exported runtime shape parity",
    0.02
  )
  samples += 4
  return { samples, png: first.png }
}
