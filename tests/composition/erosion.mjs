import { ErosionPass as RuntimeErosion } from "@runtime/renderer/erosion-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { ErosionPass } from "@/renderer/erosion-pass"
import {
  DEFAULT_EROSION_STYLE,
  EROSION_STYLES,
  erosionStyleParams,
  matchErosionStyle,
} from "@/lib/editor/config/erosion-styles"
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

const BASE = {
  mode: "edges",
  erode: 1,
  edgeWidth: 3,
  speckleSize: 1,
  clumping: 0,
  scatter: 0,
  output: "paper",
  paperColor: "#ff0000",
  speed: 0,
  seed: 0,
}

function unitChecks() {
  const entry = getLayerCatalogEntry("erosion")
  assert(entry.label === "Erosion" && entry.category === "distort", "Catalog entry")
  const layer = createLayer("erosion")
  assert(
    matchErosionStyle(layer.params) === DEFAULT_EROSION_STYLE.id,
    "New layers start on the Disintegrate style"
  )
  for (const style of EROSION_STYLES)
    assert(
      matchErosionStyle({ ...layer.params, ...erosionStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchErosionStyle({ ...layer.params, erode: 0.01 }) === "custom", "Editing shows Custom")
  return 3 + EROSION_STYLES.length
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
  const inputs = {
    split: makeInput((x) => (x < 32 ? [0, 0, 0] : [1, 1, 1])),
    white: makeInput(() => [1, 1, 1]),
    black: makeInput(() => [0, 0, 0]),
    gray: makeInput(() => [0.45, 0.45, 0.45]),
    rich: makeInput((x, y) => [x / 63, (x * 3 + y * 5) % 64 / 63, y / 63, 0.6]),
    disk: makeInput((x, y) =>
      Math.hypot(x - 31.5, y - 31.5) < 20 ? [0.2, 0.4, 0.8, 1] : [0, 0, 0, 0]
    ),
  }
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", ErosionPass],
      ["runtime", RuntimeErosion],
    ]) {
      const pass = new Pass(`erosion-${name}`)
      pass.updateCompositionRole("transform")
      pass.flushColorNode()
      const render = async (input, params, time = 0) => {
        pass.resize(N, N)
        pass.updateLogicalSize(N, N)
        pass.updateParams(params)
        pass.render(renderer, inputs[input], target, time, 0)
        return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
      }
      const record = (label, pixels) => {
        results[label] ??= {}
        results[label][name] = pixels
        samples++
      }
      const at = (px, x, y) => px.slice((y * N + x) * 4, (y * N + x) * 4 + 4)
      const isPaper = (p) => p[0] > 0.99 && p[1] < 0.01 && p[2] < 0.01
      const countPaper = (px, x0 = 0, x1 = N) => {
        let count = 0
        for (let y = 0; y < N; y++)
          for (let x = x0; x < x1; x++) if (isPaper(at(px, x, y))) count++
        return count
      }

      let px = await render("rich", { ...BASE, erode: 0, scatter: 1 })
      close(px, Array.from(inputs.rich.image.data), `${name}: erode 0 is the identity, alpha included`, 0.0005)
      record("identity", px)

      px = await render("split", BASE)
      const nearEdge = countPaper(px, 28, 36)
      const far = countPaper(px, 0, 20) + countPaper(px, 44, 64)
      assert(nearEdge > 60 && far === 0, `${name}: edges erode only near the contour (${nearEdge} near, ${far} far)`)
      record("edges", px)

      px = await render("white", { ...BASE, mode: "light" })
      assert(countPaper(px) > N * N * 0.9, `${name}: light mode eats white`)
      px = await render("black", { ...BASE, mode: "light" })
      assert(countPaper(px) === 0, `${name}: light mode leaves black`)
      px = await render("black", { ...BASE, mode: "dark" })
      assert(countPaper(px) > N * N * 0.9, `${name}: dark mode eats black`)
      record("dark", px)
      samples += 2

      px = await render("gray", { ...BASE, mode: "light", erode: 0.5, speckleSize: 8 })
      const partial = countPaper(px)
      assert(partial > 0 && partial < N * N, `${name}: partial erosion leaves crumbs (${partial})`)
      let blocky = true
      for (let by = 0; by < 8; by++)
        for (let bx = 0; bx < 8; bx++) {
          const first = isPaper(at(px, bx * 8, by * 8))
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) if (isPaper(at(px, bx * 8 + x, by * 8 + y)) !== first) blocky = false
        }
      assert(blocky, `${name}: speckle size sets the crumb blocks`)
      record("speckle blocks", px)

      px = await render("disk", { ...BASE, mode: "alpha", edgeWidth: 4, output: "transparent" })
      close(at(px, 32, 32), [0.2, 0.4, 0.8, 1], `${name}: cutout centers stay intact`, 0.001)
      let holes = 0
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const r = Math.hypot(x - 31.5, y - 31.5)
          if (r < 19 && r > 14 && at(px, x, y)[3] < 0.01) holes++
        }
      assert(holes > 20, `${name}: transparent output cuts holes along the cutout edge (${holes})`)
      record("cutout", px)

      const still = await render("split", { ...BASE, scatter: 1, erode: 0.3 })
      const unscattered = await render("split", { ...BASE, erode: 0.3 })
      assert(still.some((v, i) => Math.abs(v - unscattered[i]) > 0.01), `${name}: scatter moves crumbs`)
      record("scatter", still)
      const later = await render("split", { ...BASE, scatter: 1, erode: 0.3 }, 3)
      close(later, still, `${name}: speed 0 keeps crumbs fixed`, 0)
      assert(!pass.needsContinuousRender(), `${name}: static erosion needs no continuous render`)
      const a = await render("split", { ...BASE, erode: 0.3, speed: 1 }, 0)
      const b = await render("split", { ...BASE, erode: 0.3, speed: 1 }, 1.3)
      assert(pass.needsContinuousRender() && a.some((v, i) => Math.abs(v - b[i]) > 0.01), `${name}: speed animates the crumbs`)
      samples += 2

      for (const style of EROSION_STYLES) {
        px = await render("rich", erosionStyleParams(style))
        assert(px.every(Number.isFinite), `${name}: ${style.id} produced non-finite output`)
        record(`style ${style.id}`, px)
      }
      pass.dispose()
    }
    for (const [label, entry] of Object.entries(results))
      close(entry.editor, entry.runtime, `parity: ${label}`, 0.002)
    samples += Object.keys(results).length
  } finally {
    target.dispose()
    for (const input of Object.values(inputs)) input.dispose()
    renderer.dispose()
  }
  return samples
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

export async function checkErosion(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const grid = { ...createLayer("erosion"), id: "grid" }
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
  const paper = EROSION_STYLES.find((s) => s.id === "paper-erosion")
  for (const [key, value] of Object.entries(erosionStyleParams(paper)))
    store().updateLayerParam(grid.id, key, value)
  assert(matchErosionStyle(store().getLayerById(grid.id).params) === "paper-erosion", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchErosionStyle(store().getLayerById(grid.id).params) === DEFAULT_EROSION_STYLE.id,
    "History lost erosion settings"
  )
  const duplicateId = store().duplicateLayer(grid.id)
  store().updateLayerParam(duplicateId, "mode", "dark")
  assert(store().getLayerById(grid.id).params.mode === "edges", "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrid = reopened.layers.find((l) => l.id === grid.id)
  assert(
    reopenedGrid.type === "erosion" && matchErosionStyle(reopenedGrid.params) === DEFAULT_EROSION_STYLE.id,
    "Save/reopen changed the erosion"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grid.id).type === "erosion", "Shader export type")
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
    "Exported runtime erosion parity",
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
  for (const style of EROSION_STYLES) {
    const base = createLayer("erosion")
    const rendered = await renderProject({
      ...saved,
      composition: { width: 756, height: 454 },
      assets: [asset],
      layers:
        style.values.mode === "alpha"
          ? [
              { ...createLayer("group"), id: "type-group" },
              { ...base, id: "preview-grid", parentId: "type-group", params: { ...base.params, ...erosionStyleParams(style) } },
              {
                ...createLayer("text"),
                id: "type",
                parentId: "type-group",
                params: { ...createLayer("text").params, text: "ERODE", fontSize: 190, textColor: "#e8452c" },
              },
              { ...createLayer("image"), id: "photo", assetId: asset.id },
            ]
          : [
              { ...base, id: "preview-grid", params: { ...base.params, ...erosionStyleParams(style) } },
              { ...createLayer("image"), id: "photo", assetId: asset.id },
            ],
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
      { ...createLayer("erosion"), id: "catalog-grid" },
      { ...createLayer("image"), id: "photo", assetId: asset.id },
    ],
    selectedLayerId: "catalog-grid",
  })
  return { samples, styles, previewWebp: toWebp(catalog.image) }
}
