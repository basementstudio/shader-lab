import { GlassPass as RuntimeGlass } from "@runtime/renderer/glass-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { GlassPass } from "@/renderer/glass-pass"
import {
  DEFAULT_GLASS_STYLE,
  GLASS_STYLES,
  glassStyleParams,
  matchGlassStyle,
} from "@/lib/editor/config/glass-styles"
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
const N = 64
const S = 128

const BASE = {
  pattern: "reeded",
  profile: "round",
  cellSize: 16,
  angle: 0,
  irregularity: 0.7,
  refraction: 0,
  distance: 0,
  distanceFrom: "uniform",
  frost: 0,
  frostSize: 1.5,
  highlights: 0,
  lightAngle: 135,
  edges: 0,
  dispersion: 0,
  tint: "#ffffff",
  tintAmount: 0,
}

function unitChecks() {
  const entry = getLayerCatalogEntry("glass")
  assert(entry.label === "Glass" && entry.category === "distort", "Catalog entry")
  const layer = createLayer("glass")
  assert(matchGlassStyle(layer.params) === DEFAULT_GLASS_STYLE.id, "New layers start on Reeded")
  for (const style of GLASS_STYLES)
    assert(
      matchGlassStyle({ ...layer.params, ...glassStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchGlassStyle({ ...layer.params, cellSize: 5 }) === "custom", "Editing shows Custom")
  return 3 + GLASS_STYLES.length
}

function makeInput(fn) {
  const data = new Float32Array(S * S * 4)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const value = fn(x, y)
      data.set(value.length === 4 ? value : [...value, 1], (y * S + x) * 4)
    }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.FloatType)
  tex.needsUpdate = true
  return tex
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const checker = (x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? [1, 1, 1] : [0, 0, 0])
  const inputs = {
    ramp: makeInput((x) => [x / (S - 1), x / (S - 1), x / (S - 1)]),
    checker: makeInput(checker),
    gray: makeInput(() => [0.4, 0.4, 0.4]),
    white: makeInput(() => [1, 1, 1]),
    depth: makeInput((x) => (x < S / 2 ? [1, 1, 1] : [0, 0, 0])),
  }
  const target = new THREE.RenderTarget(S, S, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", GlassPass],
      ["runtime", RuntimeGlass],
    ]) {
      const pass = new Pass(`glass-${name}`)
      pass.updateCompositionRole("transform")
      pass.flushColorNode()
      const render = async (input, params) => {
        pass.resize(S, S)
        pass.updateLogicalSize(S, S)
        pass.updateParams(params)
        pass.render(renderer, inputs[input], target, 0, 0)
        return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, S, S))
      }
      const record = (label, pixels) => {
        results[label] ??= {}
        results[label][name] = pixels
        samples++
      }
      const at = (px, x, y) => px.slice((y * S + x) * 4, (y * S + x) * 4 + 4)
      const row = (px, y) => Array.from({ length: S }, (_, x) => at(px, x, y)[0])
      const variance = (px, y, from = 0, to = S) => {
        const values = row(px, y).slice(from, to)
        const mean = values.reduce((a, b) => a + b, 0) / values.length
        return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
      }

      for (const pattern of ["reeded", "hammered", "pyramid", "hex", "frosted"]) {
        const px = await render("checker", { ...BASE, pattern })
        close(px, Array.from(inputs.checker.image.data), `${name}: ${pattern} with nothing on is the identity`, 0.002)
        record(`identity ${pattern}`, px)
      }

      let px = await render("ramp", { ...BASE, refraction: 1 })
      const flute = row(px, 64).slice(33, 47)
      const falling = flute.slice(1).filter((v, i) => v < flute[i] - 0.001).length
      assert(falling > flute.length / 2, `${name}: round flutes flip the image inside each flute (${flute.map((v) => v.toFixed(2))})`)
      record("reeded flip", px)

      px = await render("ramp", { ...BASE, refraction: 1, profile: "sharp" })
      const sharp = row(px, 64).slice(32, 48)
      const jumps = sharp.slice(1).map((v, i) => Math.abs(v - sharp[i]))
      assert(Math.max(...jumps) > 0.05, `${name}: sharp prisms split the flute`)
      record("reeded sharp", px)

      const crisp = await render("checker", { ...BASE, distance: 0 })
      const soft = await render("checker", { ...BASE, distance: 30 })
      assert(variance(soft, 64) < variance(crisp, 64) * 0.3, `${name}: distance blurs what is behind the glass`)
      record("distance", soft)

      pass.setSceneDepth(inputs.depth)
      px = await render("checker", { ...BASE, distance: 30, distanceFrom: "depth" })
      assert(variance(px, 64, 0, 56) > variance(px, 64, 72, S) * 4, `${name}: depth keeps near things sharp and far things soft`)
      pass.setSceneDepth(null)
      record("depth", px)

      px = await render("white", { ...BASE, edges: 1 })
      assert(at(px, 32, 64)[0] < at(px, 40, 64)[0] - 0.2, `${name}: edges darken the grooves between flutes`)
      record("edges", px)

      px = await render("gray", { ...BASE, highlights: 2, refraction: 0 })
      const lit = row(px, 64)
      assert(Math.max(...lit) > 0.5, `${name}: highlights catch the flute edges`)
      record("highlights", px)

      for (const pattern of ["hammered", "pyramid", "hex"]) {
        px = await render("ramp", { ...BASE, pattern, refraction: 1 })
        const moved = px.some((v, i) => Math.abs(v - inputs.ramp.image.data[i]) > 0.05)
        assert(moved && px.every(Number.isFinite), `${name}: ${pattern} cells refract`)
        record(`refract ${pattern}`, px)
      }

      px = await render("ramp", { ...BASE, refraction: 1, dispersion: 1 })
      const fringe = Array.from({ length: S }, (_, x) => Math.abs(at(px, x, 64)[0] - at(px, x, 64)[2]))
      assert(Math.max(...fringe) > 0.01, `${name}: dispersion separates red and blue`)
      record("dispersion", px)

      px = await render("gray", { ...BASE, pattern: "frosted", frost: 1 })
      assert(variance(px, 64) > 0.00005, `${name}: frost textures the glass`)
      record("frost", px)

      px = await render("white", { ...BASE, tint: "#ff0000", tintAmount: 1 })
      close(at(px, 64, 64).slice(0, 3), [1, 0, 0], `${name}: tint colors the glass`, 0.02)
      record("tint", px)
      samples += 3

      for (const style of GLASS_STYLES) {
        px = await render("checker", glassStyleParams(style))
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

function previewLayers(style, base, asset) {
  return [
    { ...base, id: "preview-grid", params: { ...base.params, ...glassStyleParams(style) } },
    { ...createLayer("image"), id: "photo", assetId: asset.id },
  ]
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



export async function checkGlass(renderProject) {
  let samples = unitChecks()
  let passFailure = null
  try {
    samples += await passChecks()
  } catch (error) {
    passFailure = error
  }

  const grid = { ...createLayer("glass"), id: "grid" }
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
  const hex = GLASS_STYLES.find((s) => s.id === "hex")
  for (const [key, value] of Object.entries(glassStyleParams(hex)))
    store().updateLayerParam(grid.id, key, value)
  assert(matchGlassStyle(store().getLayerById(grid.id).params) === "hex", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchGlassStyle(store().getLayerById(grid.id).params) === DEFAULT_GLASS_STYLE.id,
    "History lost glass settings"
  )
  const duplicateId = store().duplicateLayer(grid.id)
  store().updateLayerParam(duplicateId, "glass", "deboss")
  assert(store().getLayerById(grid.id).params.pattern === "reeded", "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrid = reopened.layers.find((l) => l.id === grid.id)
  assert(
    reopenedGrid.type === "glass" && matchGlassStyle(reopenedGrid.params) === DEFAULT_GLASS_STYLE.id,
    "Save/reopen changed the glass"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grid.id).type === "glass", "Shader export type")
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
    "Exported runtime glass parity",
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
  for (const style of GLASS_STYLES) {
    const base = createLayer("glass")
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
  const colorAsset = {
    id: "study-color",
    kind: "image",
    url: "/scenes/default/dof-study.png",
    fileName: "study.png",
    width: 540,
    height: 780,
  }
  const depthAsset = {
    id: "study-depth",
    kind: "image",
    url: "/scenes/default/dof-study-depth.png",
    fileName: "study-depth.png",
    width: 540,
    height: 780,
  }
  const studyImage = {
    ...createLayer("image"),
    id: "study",
    assetId: colorAsset.id,
    depthAssetId: depthAsset.id,
  }
  studyImage.params = { ...studyImage.params, parallaxMotion: "off", fitMode: "cover" }
  const dof = await renderProject({
    ...saved,
    composition: { width: 540, height: 780 },
    assets: [colorAsset, depthAsset],
    layers: [
      { ...createLayer("glass"), id: "dof", params: { ...createLayer("glass").params, distance: 40, distanceFrom: "depth" } },
      studyImage,
    ],
    selectedLayerId: "dof",
  })
  styles["study-reeded-depth"] = dof.png
  samples++
  return { samples, styles, previewWebp: toWebp(dof.image), failure: passFailure?.message }
}
