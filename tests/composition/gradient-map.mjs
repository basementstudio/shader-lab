import { GradientMapPass as RuntimeGradientMap } from "@runtime/renderer/gradient-map-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { GradientMapPass } from "@/renderer/gradient-map-pass"
import {
  buildColorMapBytes,
  DEFAULT_GRADIENT_MAP_STOPS,
  evaluateGradientMapStops,
  GRADIENT_MAP_PRESETS,
  hexToRgb,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
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
const encode = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)
const linearHex = (hex) => hexToRgb(hex).map(linear)
const N = 64
const index = (v) => Math.min(N - 1, Math.max(0, Math.round((v + 0.5) * N - 0.5)))

function unitChecks() {
  const thermal = serializeGradientMapStops(DEFAULT_GRADIENT_MAP_STOPS)
  for (const invalid of [undefined, "", "not json", "[]", '[{"color":"#fff","position":0}]', 42])
    assert(
      serializeGradientMapStops(parseGradientMapStops(invalid)) === thermal,
      `Invalid stops must fall back to Thermal: ${String(invalid)}`
    )
  const parsed = parseGradientMapStops(
    '[{"position":2,"color":"#FF0000"},{"position":-1,"color":"#0000ff"},{"position":0.5,"color":"bad"}]'
  )
  assert(
    parsed.length === 2 &&
      parsed[0].color === "#0000ff" &&
      parsed[0].position === 0 &&
      parsed[1].position === 1,
    "Stops must clamp, drop invalid colors and sort"
  )
  const duotone = GRADIENT_MAP_PRESETS.find((p) => p.id === "duotone").stops
  assert(
    serializeGradientMapStops(parseGradientMapStops(serializeGradientMapStops(duotone))) ===
      serializeGradientMapStops(duotone),
    "Serialize/parse roundtrip"
  )
  close(evaluateGradientMapStops(duotone, 0), hexToRgb("#1a1040"), "Start stop")
  close(evaluateGradientMapStops(duotone, 1), hexToRgb("#ff7a59"), "End stop")
  const bytes = buildColorMapBytes([
    { position: 0, color: "#000000" },
    { position: 1, color: "#ffffff" },
  ])
  assert(bytes.length === 1024 && bytes[0] === 0 && bytes[1020] === 255 && bytes[3] === 255, "Byte LUT")
  const identity = buildColorMapBytes([])
  assert(identity[4 * 128] === 128 && identity[4 * 128 + 1] === 128, "Empty stops keep identity bytes")
  assert(
    getLayerCatalogEntry("gradient-map").label === "Gradient Map" &&
      getLayerCatalogEntry("gradient-map").category === "core",
    "Catalog entry"
  )
  assert(createLayer("gradient-map").params.stops === thermal, "New layers start with Thermal")
  return 8
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const ramp = new Float32Array(N * 4)
  for (let x = 0; x < N; x++) ramp.set([x / (N - 1), x / (N - 1), x / (N - 1), 0.6], x * 4)
  const input = new THREE.DataTexture(ramp, N, 1, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(N, 1, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  const thermal = DEFAULT_GRADIENT_MAP_STOPS
  try {
    for (const [name, Pass] of [
      ["editor", GradientMapPass],
      ["runtime", RuntimeGradientMap],
    ]) {
      const pass = new Pass(`gradient-map-${name}`)
      pass.updateCompositionRole("effect")
      pass.flushColorNode()
      const render = async (params) => {
        pass.resize(N, 1)
        pass.updateParams(params)
        pass.render(renderer, input, target, 0, 0)
        const pixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, 1))
        return (t) => {
          const i = Math.round(t * (N - 1)) * 4
          return pixels.slice(i, i + 4)
        }
      }
      const check = (label, actual, expected, tolerance) => {
        close(actual, expected, `${name}: ${label}`, tolerance)
        results[label] ??= {}
        results[label][name] = actual
        samples++
      }
      const sampled = (t) => Math.round(t * (N - 1)) / (N - 1)
      const expected = (t, stops, amount = 1) => {
        const v = sampled(t)
        return evaluateGradientMapStops(stops, encode(v))
          .map(linear)
          .map((c) => v + (c - v) * amount)
      }
      let at = await render({})
      check("thermal dark end", at(0), [...linearHex("#08083a"), 0.6], 0.02)
      check("thermal light end", at(1), [...linearHex("#ff2e63"), 0.6], 0.02)
      check("thermal middle", at(0.5), [...expected(0.5, thermal), 0.6], 0.03)
      const midGray = linear(0.5)
      check(
        "perceptual mid gray hits ramp center",
        at(midGray),
        [...expected(midGray, thermal), 0.6],
        0.03
      )
      assert(
        Math.abs(encode(sampled(midGray)) - 0.5) < 0.02,
        "Mid gray must map near the ramp center"
      )
      at = await render({ amount: 0 })
      check("amount zero passthrough", at(0.5), [sampled(0.5), sampled(0.5), sampled(0.5), 0.6], 0.01)
      at = await render({ amount: 0.5 })
      check("amount half", at(0.5).slice(0, 3), expected(0.5, thermal, 0.5), 0.03)
      at = await render({ invert: true })
      check("invert dark end", at(0), [...linearHex("#ff2e63"), 0.6], 0.02)
      const duotone = GRADIENT_MAP_PRESETS.find((p) => p.id === "duotone").stops
      at = await render({ stops: serializeGradientMapStops(duotone) })
      check("custom stops start", at(0), [...linearHex("#1a1040"), 0.6], 0.02)
      check("custom stops end", at(1), [...linearHex("#ff7a59"), 0.6], 0.02)
      at = await render({ stops: "garbage" })
      check("invalid stops fall back", at(1), [...linearHex("#ff2e63"), 0.6], 0.02)
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

function solid(id, color, opacity = 1) {
  const layer = createLayer("gradient")
  return {
    ...layer,
    id,
    opacity,
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

export async function checkGradientMap(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const group = { ...createLayer("group"), id: "portrait" }
  const map = {
    ...createLayer("gradient-map"),
    id: "map",
    parentId: group.id,
    mask: { ...DEFAULT_LAYER_MASK, shape: "ellipse", size: [0.5, 0.5], feather: 0 },
  }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [
      { ...solid("blue", "#0000ff", 0.5), mask: { ...DEFAULT_LAYER_MASK, shape: "rectangle", center: [0.35, -0.35], size: [0.3, 0.3], feather: 0 } },
      group,
      map,
      { ...solid("gray", "#808080"), parentId: group.id },
    ],
    selectedLayerId: map.id,
    composition: { width: N, height: N },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const store = () => useLayerStore.getState()
  const before = buildEditorHistorySnapshot()
  const sepia = GRADIENT_MAP_PRESETS.find((p) => p.id === "sepia").stops
  store().updateLayerParam(map.id, "stops", serializeGradientMapStops(sepia))
  store().updateLayerParam(map.id, "amount", 0.4)
  assert(
    parseGradientMapStops(store().getLayerById(map.id).params.stops)[1].color === "#8c6a3f",
    "Ramp edits must reach the store"
  )
  applyEditorHistorySnapshot(before)
  assert(
    store().getLayerById(map.id).params.stops === serializeGradientMapStops(DEFAULT_GRADIENT_MAP_STOPS) &&
      store().getLayerById(map.id).params.amount === 1,
    "History lost gradient map settings"
  )
  const duplicateId = store().duplicateLayer(map.id)
  store().updateLayerParam(duplicateId, "invert", true)
  assert(store().getLayerById(map.id).params.invert === false, "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedMap = reopened.layers.find((l) => l.id === map.id)
  assert(
    reopenedMap.type === "gradient-map" &&
      reopenedMap.params.stops === map.params.stops &&
      reopenedMap.mask.shape === "ellipse",
    "Save/reopen changed the gradient map"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === map.id).type === "gradient-map", "Shader export type")
  samples += 4

  const first = await renderProject(saved)
  const at = (image, x, y) => {
    const i = (index(y) * N + index(x)) * 4
    return Array.from(image.data.slice(i, i + 4))
  }
  const center = at(first.image, 0, 0)
  assert(
    center[2] > center[0] + 40 && center[3] === 255,
    `Mapped gray must turn blue-ish inside the mask, got ${center}`
  )
  close(at(first.image, 0.4, 0.4), [128, 128, 128, 255], "Unmasked gray keeps its color", 2)
  const hiddenMap = {
    ...saved,
    layers: saved.layers.map((l) => (l.id === map.id ? { ...l, visible: false } : l)),
  }
  const unmapped = await renderProject(hiddenMap)
  close(at(first.image, -0.45, -0.45), at(unmapped.image, -0.45, -0.45), "Outside the mask nothing changes", 1)
  close(at(first.image, 0.45, -0.4), at(unmapped.image, 0.45, -0.4), "External top layer stays identical", 1)
  const changed = at(first.image, 0, 0)
    .slice(0, 3)
    .reduce((sum, v, i) => sum + Math.abs(v - at(unmapped.image, 0, 0)[i]), 0)
  assert(changed > 60, `Inside the mask the map must change the image (${changed})`)
  const restored = await renderProject(reopened)
  close(Array.from(restored.image.data), Array.from(first.image.data), "Reopened pixels", 0)
  const runtimePixels = await runtimeRender(config)
  close(
    runtimePixels,
    Array.from(first.image.data, (value, i) => {
      const v = value / 255
      return i % 4 === 3 ? v : linear(v)
    }),
    "Exported runtime gradient map parity",
    0.02
  )
  samples += 4

  const asset = {
    id: "photo-asset",
    kind: "image",
    url: "/scenes/default/rings-photo.webp",
    fileName: "slice.webp",
    width: 1512,
    height: 908,
  }
  const art = {
    ...saved,
    composition: { width: 480, height: 600 },
    assets: [asset],
    layers: [
      { ...createLayer("gradient-map"), id: "preview-map" },
      { ...createLayer("image"), id: "photo", assetId: asset.id },
    ],
    selectedLayerId: "preview-map",
    sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: "#08083a" },
  }
  const preview = await renderProject(art)
  const colors = new Set()
  for (let i = 0; i < preview.image.data.length; i += 4)
    colors.add(preview.image.data.slice(i, i + 3).join(","))
  assert(colors.size > 100, "Gradient map preview is blank")
  const thumbnail = document.createElement("canvas")
  thumbnail.width = preview.image.width
  thumbnail.height = preview.image.height
  thumbnail.getContext("2d").putImageData(preview.image, 0, 0)
  samples++
  return { samples, png: first.png, previewWebp: thumbnail.toDataURL("image/webp", 0.85) }
}
