import { ColorHalosPass as RuntimeColorHalos } from "@runtime/renderer/color-halos-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { ColorHalosPass } from "@/renderer/color-halos-pass"
import { serializeGradientMapStops } from "@/renderer/color-map-lut"
import {
  COLOR_HALOS_STYLES,
  colorHalosStyleParams,
  DEFAULT_COLOR_HALOS_STYLE,
  matchColorHalosStyle,
} from "@/lib/editor/config/color-halos-styles"
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
const N = 64

const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const RAMP = [
  { position: 0, color: "#0000ff" },
  { position: 1, color: "#ff0000" },
]
const BASE = {
  stops: serializeGradientMapStops(RAMP),
  glowFrom: "dark",
  threshold: 0.5,
  spread: 6,
  intensity: 1.6,
  reach: 0.05,
  bands: 0,
  keepShape: false,
  amount: 1,
  flare: 0,
  flareLength: 40,
  flareThreshold: 0.8,
  flareColor: "#ffffff",
}

function unitChecks() {
  const entry = getLayerCatalogEntry("color-halos")
  assert(entry.label === "Color Halos" && entry.category === "core", "Catalog entry")
  const layer = createLayer("color-halos")
  assert(
    matchColorHalosStyle(layer.params) === DEFAULT_COLOR_HALOS_STYLE.id,
    "New layers start on the Gradient Maps style"
  )
  for (const style of COLOR_HALOS_STYLES)
    assert(
      matchColorHalosStyle({ ...layer.params, ...colorHalosStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchColorHalosStyle({ ...layer.params, keepShape: false }) === "custom", "Editing shows Custom")
  return 3 + COLOR_HALOS_STYLES.length
}

function makeInput(fn) {
  const data = new Float32Array(N * N * 4)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const value = fn(x, y)
      data.set(value.length === 4 ? value : [...value, 1], (y * N + x) * 4)
    }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType)
  tex.needsUpdate = true
  return tex
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const inSquare = (x, y) => x >= 26 && x < 38 && y >= 26 && y < 38
  const inputs = {
    white: makeInput(() => [1, 1, 1]),
    square: makeInput((x, y) => (inSquare(x, y) ? [0, 0, 0] : [1, 1, 1])),
    lightSquare: makeInput((x, y) => (inSquare(x, y) ? [1, 1, 1] : [0, 0, 0])),
    dot: makeInput((x, y) => (Math.hypot(x - 31.5, y - 31.5) < 2 ? [1, 1, 1] : [0, 0, 0])),
  }
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", ColorHalosPass],
      ["runtime", RuntimeColorHalos],
    ]) {
      const pass = new Pass(`color-halos-${name}`)
      pass.updateCompositionRole("transform")
      pass.flushColorNode()
      const render = async (input, params) => {
        pass.resize(N, N)
        pass.updateLogicalSize(N, N)
        pass.updateParams(params)
        pass.render(renderer, inputs[input], target, 0, 0)
        return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
      }
      const record = (label, pixels) => {
        results[label] ??= {}
        results[label][name] = pixels
        samples++
      }
      const at = (px, x, y) => px.slice((y * N + x) * 4, (y * N + x) * 4 + 3)

      let px = await render("square", { ...BASE, amount: 0 })
      close(px, Array.from(inputs.square.image.data), `${name}: amount 0 passes the image through`, 0.001)

      px = await render("white", BASE)
      close(px, Array.from(inputs.white.image.data), `${name}: paper above the threshold stays untouched`, 0.001)
      record("paper", px)

      px = await render("square", { ...BASE, intensity: 3 })
      close(at(px, 2, 2), [1, 1, 1], `${name}: far from the shape the image is unchanged`, 0.01)
      const core = at(px, 32, 32)
      assert(core[0] > 0.8 && core[2] < 0.2, `${name}: the halo core takes the right end of the ramp (${core})`)
      const rim = [12, 14, 16, 18, 20].map((x) => at(px, x, 32))
      assert(
        rim.some((p) => p[2] > p[0] && p[2] > 0.3),
        `${name}: the outer halo takes the left end of the ramp (${JSON.stringify(rim)})`
      )
      record("halo", px)

      px = await render("square", { ...BASE, keepShape: true })
      close(at(px, 32, 32), [0, 0, 0], `${name}: keep shape draws the crisp original on top`, 0.02)
      assert(at(px, 22, 32)[2] > 0.3, `${name}: keep shape leaves the halo around it`)
      record("keep shape", px)

      px = await render("square", { ...BASE, bands: 3 })
      const counts = new Map()
      let haloPixels = 0
      for (let y = 10; y < 54; y++)
        for (let x = 10; x < 54; x++) {
          const p = at(px, x, y)
          if (p[0] > 0.99 && p[1] > 0.99 && p[2] > 0.99) continue
          haloPixels++
          const key = p.map((v) => v.toFixed(2)).join()
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      const dominant = [...counts.values()].sort((a, b) => b - a).slice(0, 4)
      const share = dominant.reduce((sum, v) => sum + v, 0) / haloPixels
      assert(share > 0.6, `${name}: bands flatten the halo into a few flat colors (${share})`)
      record("bands", px)

      px = await render("lightSquare", { ...BASE, glowFrom: "light" })
      assert(at(px, 20, 32)[2] > 0.3, `${name}: light mode haloes light shapes`)
      record("light", px)

      px = await render("dot", { ...BASE, glowFrom: "light", amount: 0, flare: 1, flareLength: 40 })
      const axis = at(px, 12, 32)[0]
      const diagonal = at(px, 18, 18)[0]
      assert(axis > 0.05 && axis > diagonal * 3, `${name}: flares streak along the axes (${axis} vs ${diagonal})`)
      record("flare", px)
      samples += 3

      for (const style of COLOR_HALOS_STYLES) {
        px = await render("square", colorHalosStyleParams(style))
        assert(px.every(Number.isFinite), `${name}: ${style.id} produced non-finite output`)
        record(`style ${style.id}`, px)
      }
      pass.dispose()
    }
    for (const [label, entry] of Object.entries(results))
      close(entry.editor, entry.runtime, `parity: ${label}`, 0.004)
    samples += Object.keys(results).length
  } finally {
    target.dispose()
    for (const input of Object.values(inputs)) input.dispose()
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

function stripes(id) {
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

function previewLayers(style, base, asset) {
  const halos = { ...base, id: "preview-grid", params: { ...base.params, ...colorHalosStyleParams(style) } }
  const photo = { ...createLayer("image"), id: "photo", assetId: asset.id }
  if (style.id === "cross-flare")
    return [
      halos,
      ...[
        [-0.4, 0.15, 0.05, "#ffffff"],
        [0.1, -0.2, 0.035, "#ffffff"],
        [0.45, 0.25, 0.045, "#ffffff"],
        [-0.15, 0.05, 0.22, "#101418"],
        [0.3, -0.05, 0.16, "#101418"],
      ].map(([x, y, r, color], index) => ({
        ...createLayer("shape"),
        id: `spot-${index}`,
        params: {
          ...createLayer("shape").params,
          shape: "ellipse",
          center: [x, y],
          size: [r, r],
          color,
          softness: 0.02,
        },
      })),
      solid("paper", "#cfe0ea"),
    ]
  if (style.id === "gradient-maps")
    return [
      { ...createLayer("group"), id: "type-group" },
      { ...halos, parentId: "type-group" },
      {
        ...createLayer("text"),
        id: "type",
        parentId: "type-group",
        params: { ...createLayer("text").params, text: "HALO", fontSize: 200, textColor: "#1c1417" },
      },
      photo,
    ]
  return [halos, photo]
}

export async function checkColorHalos(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const grid = { ...createLayer("color-halos"), id: "grid" }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [grid, stripes("field")],
    selectedLayerId: grid.id,
    composition: { width: N, height: N },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const store = () => useLayerStore.getState()
  const before = buildEditorHistorySnapshot()
  const aura = COLOR_HALOS_STYLES.find((s) => s.id === "aura")
  for (const [key, value] of Object.entries(colorHalosStyleParams(aura)))
    store().updateLayerParam(grid.id, key, value)
  assert(matchColorHalosStyle(store().getLayerById(grid.id).params) === "aura", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchColorHalosStyle(store().getLayerById(grid.id).params) === DEFAULT_COLOR_HALOS_STYLE.id,
    "History lost color halos settings"
  )
  const duplicateId = store().duplicateLayer(grid.id)
  store().updateLayerParam(duplicateId, "color-halos", "deboss")
  assert(store().getLayerById(grid.id).params.glowFrom === "dark", "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrid = reopened.layers.find((l) => l.id === grid.id)
  assert(
    reopenedGrid.type === "color-halos" && matchColorHalosStyle(reopenedGrid.params) === DEFAULT_COLOR_HALOS_STYLE.id,
    "Save/reopen changed the color halos"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grid.id).type === "color-halos", "Shader export type")
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
    "Exported runtime color halos parity",
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
  for (const style of COLOR_HALOS_STYLES) {
    const base = createLayer("color-halos")
    const rendered = await renderProject({
      ...saved,
      composition: { width: 756, height: 454 },
      assets: [asset],
      layers: previewLayers(style, base, asset),
      selectedLayerId: "preview-grid",
    })
    styles[style.id] = rendered.png
    samples++
  }
  const catalog = await renderProject({
    ...saved,
    composition: { width: 480, height: 600 },
    assets: [asset],
    layers: [
      { ...createLayer("color-halos"), id: "catalog-grid" },
      { ...createLayer("image"), id: "photo", assetId: asset.id },
    ],
    selectedLayerId: "catalog-grid",
  })
  return { samples, styles, previewWebp: toWebp(catalog.image) }
}
