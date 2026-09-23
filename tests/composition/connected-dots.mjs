import { ConnectedDotsPass as RuntimeDots } from "@runtime/renderer/connected-dots-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { ConnectedDotsPass } from "@/renderer/connected-dots-pass"
import { serializeGradientMapStops } from "@/renderer/color-map-lut"
import {
  CONNECTED_DOTS_STYLES,
  connectedDotsStyleParams,
  DEFAULT_CONNECTED_DOTS_STYLE,
  matchConnectedDotsStyle,
} from "@/lib/editor/config/connected-dots-styles"
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

const TWO = serializeGradientMapStops([
  { position: 0, color: "#000000" },
  { position: 1, color: "#ff0000" },
])
const BASE = {
  stops: TWO,
  mode: "graph",
  spacing: 12,
  jitter: 0.8,
  cutoff: 0.05,
  invert: false,
  dotShape: "circle",
  minSize: 0.3,
  maxSize: 0.3,
  links: 0,
  linkThreshold: 0.3,
  linkMin: 0.15,
  linkMax: 0.15,
  blobiness: 0.5,
  range: 1.6,
  lineWidth: 1,
  colorMode: "ink",
  ink: "#000000",
  background: "color",
  backgroundColor: "#ffffff",
  drift: 0,
  speed: 0,
  seed: 0,
}

function unitChecks() {
  const entry = getLayerCatalogEntry("connected-dots")
  assert(entry.label === "Connected Dots" && entry.category === "core", "Catalog entry")
  const layer = createLayer("connected-dots")
  assert(matchConnectedDotsStyle(layer.params) === DEFAULT_CONNECTED_DOTS_STYLE.id, "New layers start on Portrait Graph")
  for (const style of CONNECTED_DOTS_STYLES)
    assert(
      matchConnectedDotsStyle({ ...layer.params, ...connectedDotsStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchConnectedDotsStyle({ ...layer.params, spacing: 40 }) === "custom", "Editing shows Custom")
  assert(matchConnectedDotsStyle({ ...layer.params, drift: 0.5, speed: 2 }) === DEFAULT_CONNECTED_DOTS_STYLE.id, "Motion is not part of a style")
  return 4 + CONNECTED_DOTS_STYLES.length
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
  const inputs = {
    white: makeInput(() => [1, 1, 1]),
    black: makeInput(() => [0, 0, 0]),
    gray: makeInput(() => [0.2, 0.2, 0.2]),
    red: makeInput(() => [0.6, 0, 0]),
    ramp: makeInput((x) => [x / (S - 1), x / (S - 1), x / (S - 1)]),
  }
  const target = new THREE.RenderTarget(S, S, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", ConnectedDotsPass],
      ["runtime", RuntimeDots],
    ]) {
      const pass = new Pass(`dots-${name}`)
      pass.updateCompositionRole("transform")
      pass.flushColorNode()
      const render = async (input, params, time = 0) => {
        pass.resize(S, S)
        pass.updateLogicalSize(S, S)
        pass.updateParams(params)
        pass.render(renderer, inputs[input], target, time, 0)
        return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, S, S))
      }
      const record = (label, pixels) => {
        results[label] ??= {}
        results[label][name] = pixels
        samples++
      }
      const inked = (px, x0 = 0, x1 = S) => {
        let count = 0
        let total = 0
        for (let y = 0; y < S; y++)
          for (let x = x0; x < x1; x++) {
            total++
            count += 1 - px[(y * S + x) * 4 + 1]
          }
        return count / total
      }

      let px = await render("white", BASE)
      close(px, Array.from({ length: S * S }, () => [1, 1, 1, 1]).flat(), `${name}: no dark tones, only background`, 0.001)
      record("empty", px)

      const dots = await render("black", BASE)
      const dotShare = inked(dots)
      assert(dotShare > 0.04 && dotShare < 0.45, `${name}: isolated dots cover part of the frame (${dotShare})`)
      record("dots", dots)
      const linked = await render("black", { ...BASE, links: 1, linkThreshold: 0, linkMin: 0.3, linkMax: 0.3 })
      assert(inked(linked) > dotShare + 0.1, `${name}: links connect neighbors (${inked(linked)})`)
      record("links", linked)
      const merged = await render("black", { ...BASE, mode: "blobs", links: 1, linkThreshold: 0, linkMin: 0.3, linkMax: 0.3, blobiness: 1 })
      assert(inked(merged) > inked(linked) + 0.03, `${name}: blobs melt dots and links together`)
      record("blobs", merged)

      px = await render("ramp", { ...BASE, minSize: 0.1, maxSize: 0.6 })
      assert(inked(px, 0, 40) > inked(px, 88, S) * 2, `${name}: dark tones get bigger dots`)
      record("tone size", px)

      px = await render("gray", { ...BASE, cutoff: 0.9 })
      assert(inked(px) < 0.001, `${name}: cutoff drops tones below it`)
      px = await render("white", { ...BASE, invert: true })
      assert(inked(px) > 0.04, `${name}: invert gives light areas the points`)
      record("invert", px)

      px = await render("black", { ...BASE, dotShape: "square" })
      assert(inked(px) > dotShare, `${name}: square dots cover more than circles`)
      record("square", px)

      const short = await render("black", { ...BASE, mode: "plexus", range: 1, lineWidth: 1 })
      const long = await render("black", { ...BASE, mode: "plexus", range: 2.9, lineWidth: 1 })
      assert(inked(long) > inked(short) + 0.01, `${name}: plexus range reaches more neighbors`)
      record("plexus", long)

      px = await render("black", { ...BASE, colorMode: "palette" })
      const ink = [0, 1, 2].map((c) => Math.max(...px.filter((_, i) => i % 4 === c)))
      assert(ink[0] < 1.01 && Math.min(...px.filter((_, i) => i % 4 === 1)) < 0.01, `${name}: palette colors dark dots with the dark stop`)
      record("palette", px)

      px = await render("red", { ...BASE, colorMode: "source" })
      const reds = px.filter((_, i) => i % 4 === 0)
      assert(Math.min(...px.filter((_, i) => i % 4 === 1)) < 0.01 && Math.max(...reds) > 0.99, `${name}: source colors paint dots with the image`)
      record("source", px)

      px = await render("black", { ...BASE, background: "transparent" })
      const alphas = px.filter((_, i) => i % 4 === 3)
      assert(Math.min(...alphas) < 0.01 && Math.max(...alphas) > 0.99, `${name}: transparent background leaves gaps clear`)
      record("transparent", px)

      const still = await render("black", { ...BASE, drift: 0, speed: 1 }, 0)
      const later = await render("black", { ...BASE, drift: 0, speed: 1 }, 2)
      close(still, later, `${name}: no drift keeps points fixed`, 0)
      assert(!pass.needsContinuousRender(), `${name}: fixed points need no continuous render`)
      const a = await render("black", { ...BASE, drift: 1, speed: 1 }, 0)
      const b = await render("black", { ...BASE, drift: 1, speed: 1 }, 2)
      assert(pass.needsContinuousRender() && a.some((v, i) => Math.abs(v - b[i]) > 0.1), `${name}: drift moves the points`)
      record("drift", b)
      samples += 4

      px = await render("black", { ...BASE, mode: "mesh", wire: 0, meshFill: 1 })
      assert(inked(px) > 0.97, `${name}: mesh fills the frame with triangles (${inked(px)})`)
      record("mesh fill", px)
      px = await render("black", { ...BASE, mode: "mesh", wire: 1, meshFill: 0, wireColor: "#000000", lineWidth: 1 })
      const wired = inked(px)
      assert(wired > 0.05 && wired < 0.6, `${name}: mesh wire draws the triangle edges (${wired})`)
      record("mesh wire", px)
      px = await render("ramp", { ...BASE, mode: "mesh", wire: 0, colorMode: "source", cutoff: 0, spacing: 24 })
      const facets = new Set()
      for (let i = 0; i < px.length; i += 4) facets.add(px[i].toFixed(3))
      assert(facets.size < 200, `${name}: mesh triangles are flat (${facets.size} tones)`)
      record("mesh flat", px)
      px = await render("white", { ...BASE, mode: "mesh", wire: 1 })
      close(px, Array.from({ length: S * S }, () => [1, 1, 1, 1]).flat(), `${name}: mesh drops cut-off areas`, 0.001)
      samples += 1

      for (const style of CONNECTED_DOTS_STYLES) {
        px = await render("ramp", connectedDotsStyleParams(style))
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
    { ...base, id: "preview-grid", params: { ...base.params, ...connectedDotsStyleParams(style) } },
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



export async function checkConnectedDots(renderProject) {
  let samples = unitChecks()
  let passFailure = null
  try {
    samples += await passChecks()
  } catch (error) {
    passFailure = error
  }

  const grid = { ...createLayer("connected-dots"), id: "grid" }
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
  const blobs = CONNECTED_DOTS_STYLES.find((s) => s.id === "ink-blobs")
  for (const [key, value] of Object.entries(connectedDotsStyleParams(blobs)))
    store().updateLayerParam(grid.id, key, value)
  assert(matchConnectedDotsStyle(store().getLayerById(grid.id).params) === "ink-blobs", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchConnectedDotsStyle(store().getLayerById(grid.id).params) === DEFAULT_CONNECTED_DOTS_STYLE.id,
    "History lost connected dots settings"
  )
  const duplicateId = store().duplicateLayer(grid.id)
  store().updateLayerParam(duplicateId, "connected-dots", "deboss")
  assert(store().getLayerById(grid.id).params.mode === "graph", "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrid = reopened.layers.find((l) => l.id === grid.id)
  assert(
    reopenedGrid.type === "connected-dots" && matchConnectedDotsStyle(reopenedGrid.params) === DEFAULT_CONNECTED_DOTS_STYLE.id,
    "Save/reopen changed the connected dots"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grid.id).type === "connected-dots", "Shader export type")
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
    "Exported runtime connected dots parity",
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
  for (const style of CONNECTED_DOTS_STYLES) {
    const base = createLayer("connected-dots")
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
      { ...createLayer("connected-dots"), id: "dof" },
      studyImage,
    ],
    selectedLayerId: "dof",
  })
  styles["study-forms"] = dof.png
  samples++
  return { samples, styles, previewWebp: toWebp(dof.image), failure: passFailure?.message }
}
