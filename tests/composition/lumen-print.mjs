import { LumenPrintPass as RuntimeLumenPrint } from "@runtime/renderer/lumen-print-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { LumenPrintPass } from "@/renderer/lumen-print-pass"
import {
  DEFAULT_LUMEN_PRINT_STOPS,
  hexToRgb,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import {
  DEFAULT_LUMEN_PRINT_STYLE,
  LUMEN_PRINT_STYLES,
  lumenPrintStyleParams,
  matchLumenPrintStyle,
} from "@/lib/editor/config/lumen-print-styles"
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
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

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
const N = 64

const GRAY = serializeGradientMapStops([
  { position: 0, color: "#000000" },
  { position: 1, color: "#ffffff" },
])
const NEUTRAL = {
  stops: GRAY,
  amount: 1,
  exposure: 0,
  contrast: 1,
  solarize: 0,
  pivot: 0.5,
  edgeLines: 0,
  diffusion: 0,
  halation: 0,
  radius: 12,
  washout: 0,
  ragged: 0,
  edgeBurn: 0,
  grain: 0,
  grainSize: 1.5,
  seed: 0,
}

function unitChecks() {
  const entry = getLayerCatalogEntry("lumen-print")
  assert(entry.label === "Lumen Print" && entry.category === "core", "Catalog entry")
  const layer = createLayer("lumen-print")
  assert(matchLumenPrintStyle(layer.params) === "lumen", "New layers start on the Lumen style")
  assert(
    layer.params.stops === serializeGradientMapStops(DEFAULT_LUMEN_PRINT_STOPS),
    "New layers start with the Lumen palette"
  )
  for (const style of LUMEN_PRINT_STYLES) {
    assert(style.stops.length >= 2 && style.stops.length <= 5, `${style.id}: 2-5 stops`)
    assert(
      matchLumenPrintStyle({ ...layer.params, ...lumenPrintStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  }
  assert(
    matchLumenPrintStyle({ ...layer.params, grain: 0.9 }) === "custom",
    "Editing a style control must show Custom"
  )
  assert(
    new Set(LUMEN_PRINT_STYLES.map((s) => s.id)).size === LUMEN_PRINT_STYLES.length,
    "Style ids are unique"
  )
  return 4 + LUMEN_PRINT_STYLES.length
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
  const paper = hexToRgb(DEFAULT_LUMEN_PRINT_STOPS.at(-1).color).map(linear)
  try {
    for (const [name, Pass] of [
      ["editor", LumenPrintPass],
      ["runtime", RuntimeLumenPrint],
    ]) {
      const pass = new Pass(`lumen-print-${name}`)
      pass.updateCompositionRole("effect")
      pass.flushColorNode()
      const render = async (params) => {
        pass.resize(N, 1)
        pass.updateLogicalSize(N, 1)
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
      const gray = (v) => [v, v, v, 0.6]

      let at = await render(NEUTRAL)
      for (const t of [0.1, 0.35, 0.7, 0.95])
        check(`neutral print is identity at ${t}`, at(t), gray(sampled(t)), 0.02)

      at = await render({ ...NEUTRAL, amount: 0, grain: 1, washout: 1 })
      check("amount zero passthrough", at(0.5), gray(sampled(0.5)), 0.002)

      at = await render({ ...NEUTRAL, solarize: 1, pivot: 0 })
      for (const t of [0.2, 0.6])
        check(
          `pivot zero solarize is a negative at ${t}`,
          at(t),
          gray(linear(1 - encode(sampled(t)))),
          0.03
        )

      at = await render({ ...NEUTRAL, solarize: 1, pivot: 0.5 })
      const peak = at(linear(0.5))[0]
      assert(
        peak > at(0)[0] + 0.5 && peak > at(1)[0] + 0.5,
        `${name}: full solarize must peak at the pivot`
      )
      samples++

      at = await render({ ...NEUTRAL, contrast: 2 })
      assert(at(0.1)[0] < sampled(0.1) && at(0.9)[0] > sampled(0.9) - 0.001, `${name}: contrast`)
      samples++

      at = await render({ ...NEUTRAL, stops: serializeGradientMapStops(DEFAULT_LUMEN_PRINT_STOPS), washout: 1 })
      check("full washout burns to paper", at(0.6), [...paper, 0.6], 0.02)

      at = await render({ ...NEUTRAL, grain: 1 })
      const grained = [0.3, 0.4, 0.5, 0.6].map((t) => at(t)[0] - sampled(t))
      assert(
        grained.some((d) => Math.abs(d) > 0.01) && grained.every(Number.isFinite),
        `${name}: grain must perturb the midtones`
      )
      samples++

      for (const style of LUMEN_PRINT_STYLES) {
        at = await render(lumenPrintStyleParams(style))
        const row = [0, 0.25, 0.5, 0.75, 1].flatMap((t) => at(t))
        assert(row.every(Number.isFinite), `${name}: ${style.id} produced non-finite output`)
        results[`style ${style.id}`] ??= {}
        results[`style ${style.id}`][name] = row
        samples++
      }
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

function toWebp(image) {
  const canvas = document.createElement("canvas")
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext("2d").putImageData(image, 0, 0)
  return canvas.toDataURL("image/webp", 0.85)
}

export async function checkLumenPrint(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const print = { ...createLayer("lumen-print"), id: "print" }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [print, solid("gray", "#808080")],
    selectedLayerId: print.id,
    composition: { width: N, height: N },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const store = () => useLayerStore.getState()
  const before = buildEditorHistorySnapshot()
  const burned = LUMEN_PRINT_STYLES.find((s) => s.id === "burned")
  for (const [key, value] of Object.entries(lumenPrintStyleParams(burned)))
    store().updateLayerParam(print.id, key, value)
  assert(matchLumenPrintStyle(store().getLayerById(print.id).params) === "burned", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchLumenPrintStyle(store().getLayerById(print.id).params) === DEFAULT_LUMEN_PRINT_STYLE.id,
    "History lost lumen print settings"
  )
  const duplicateId = store().duplicateLayer(print.id)
  store().updateLayerParam(duplicateId, "solarize", 1)
  assert(store().getLayerById(print.id).params.solarize !== 1, "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedPrint = reopened.layers.find((l) => l.id === print.id)
  assert(
    reopenedPrint.type === "lumen-print" && matchLumenPrintStyle(reopenedPrint.params) === "lumen",
    "Save/reopen changed the lumen print"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === print.id).type === "lumen-print", "Shader export type")
  samples += 4

  const first = await renderProject(saved)
  const restored = await renderProject(reopened)
  close(Array.from(restored.image.data), Array.from(first.image.data), "Reopened pixels", 0)
  const runtimePixels = await runtimeRender(config)
  close(
    runtimePixels,
    Array.from(first.image.data, (value, i) => {
      const v = value / 255
      return i % 4 === 3 ? v : linear(v)
    }),
    "Exported runtime lumen print parity",
    0.02
  )
  samples += 2

  const asset = {
    id: "photo-asset",
    kind: "image",
    url: "/scenes/default/editorial/flora.webp",
    fileName: "flora.webp",
    width: 1512,
    height: 908,
  }
  const styles = {}
  for (const style of LUMEN_PRINT_STYLES) {
    const art = {
      ...saved,
      composition: { width: 756, height: 454 },
      assets: [asset],
      layers: [
        { ...createLayer("lumen-print"), id: "preview-print", params: { ...createLayer("lumen-print").params, ...lumenPrintStyleParams(style) } },
        { ...createLayer("image"), id: "photo", assetId: asset.id },
      ],
      selectedLayerId: "preview-print",
    }
    const rendered = await renderProject(art)
    const colors = new Set()
    for (let i = 0; i < rendered.image.data.length; i += 16)
      colors.add(rendered.image.data.slice(i, i + 3).join(","))
    assert(colors.size > 100, `${style.id} preview is blank`)
    styles[style.id] = rendered.png
    samples++
  }
  const catalog = await renderProject({
    ...saved,
    composition: { width: 480, height: 600 },
    assets: [asset],
    layers: [
      { ...createLayer("lumen-print"), id: "catalog-print" },
      { ...createLayer("image"), id: "photo", assetId: asset.id },
    ],
    selectedLayerId: "catalog-print",
  })
  return { samples, styles, previewWebp: toWebp(catalog.image) }
}
