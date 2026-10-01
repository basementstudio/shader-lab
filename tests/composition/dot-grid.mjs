import { DotGridPass as RuntimeDotGrid } from "@runtime/renderer/dot-grid-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { DotGridPass } from "@/renderer/dot-grid-pass"
import {
  DEFAULT_DOT_GRID_STYLE,
  DOT_GRID_STYLES,
  dotGridStyleParams,
  matchDotGridStyle,
} from "@/lib/editor/config/dot-grid-styles"
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
  spacing: 8,
  minDot: 0,
  maxDot: 1,
  contrast: 1,
  level: 0.5,
  softness: 0,
  shape: "circle",
  inkMode: "ink",
  inkColor: "#000000",
  backgroundColor: "#ffffff",
  invert: false,
  underlay: 0,
  underlayBlur: 24,
}

function unitChecks() {
  const entry = getLayerCatalogEntry("dot-grid")
  assert(entry.label === "Dot Grid" && entry.category === "core", "Catalog entry")
  const layer = createLayer("dot-grid")
  assert(
    matchDotGridStyle(layer.params) === DEFAULT_DOT_GRID_STYLE.id,
    "New layers start on the Coordinate style"
  )
  for (const style of DOT_GRID_STYLES)
    assert(
      matchDotGridStyle({ ...layer.params, ...dotGridStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchDotGridStyle({ ...layer.params, spacing: 31 }) === "custom", "Editing shows Custom")
  assert(matchDotGridStyle({ ...layer.params, invert: true }) === "custom", "Booleans take part in matching")
  return 4 + DOT_GRID_STYLES.length
}

function makeInput(fn) {
  const data = new Float32Array(N * N * 4)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) data.set([...fn(x / (N - 1), y / (N - 1)), 1], (y * N + x) * 4)
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType)
  tex.needsUpdate = true
  return tex
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const inputs = {
    black: makeInput(() => [0, 0, 0]),
    white: makeInput(() => [1, 1, 1]),
    red: makeInput(() => [1, 0, 0]),
    gray: makeInput(() => [0.2, 0.2, 0.2]),
    ramp: makeInput((x) => [linear(x), linear(x), linear(x)]),
  }
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", DotGridPass],
      ["runtime", RuntimeDotGrid],
    ]) {
      const pass = new Pass(`dot-grid-${name}`)
      pass.updateCompositionRole("effect")
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
      const at = (px, x, y) => px.slice((y * N + x) * 4, (y * N + x) * 4 + 4)
      const inked = (px, x0 = 0, x1 = N) => {
        let count = 0
        let total = 0
        for (let y = 0; y < N; y++)
          for (let x = x0; x < x1; x++) {
            total++
            count += 1 - at(px, x, y)[0]
          }
        return count / total
      }

      let px = await render("white", BASE)
      close(px, Array.from({ length: N * N }, () => [1, 1, 1, 1]).flat(), `${name}: white paper with no min dot is blank`, 0.001)
      record("blank", px)

      px = await render("black", BASE)
      close(at(px, 3, 3).slice(0, 3), [0, 0, 0], `${name}: cell centers carry ink`, 0.02)
      close(at(px, 0, 0).slice(0, 3), [1, 1, 1], `${name}: cell corners stay paper`, 0.02)
      const circle = inked(px)
      assert(Math.abs(circle - Math.PI / 4) < 0.06, `${name}: full circles cover about pi/4 (${circle})`)
      const period = Array.from({ length: N * N }, (_, i) => {
        const x = i % N
        const y = Math.floor(i / N)
        return Math.abs(at(px, x, y)[0] - at(px, x % 8, y % 8)[0])
      })
      assert(Math.max(...period) < 0.001, `${name}: every cell is identical on a flat tone`)
      record("full circles", px)

      px = await render("black", { ...BASE, shape: "square", maxDot: 0.5 })
      const square = inked(px)
      assert(Math.abs(square - 0.25) < 0.06, `${name}: half squares cover a quarter (${square})`)
      record("squares", px)

      px = await render("white", { ...BASE, minDot: 0.5 })
      const specks = inked(px)
      assert(Math.abs(specks - Math.PI / 16) < 0.04, `${name}: min dot keeps the grid on paper (${specks})`)
      record("min dot", px)

      px = await render("white", { ...BASE, invert: true })
      assert(Math.abs(inked(px) - Math.PI / 4) < 0.06, `${name}: invert gives light areas the large dots`)
      record("invert", px)

      px = await render("ramp", BASE)
      const left = inked(px, 0, 16)
      const right = inked(px, 48, 64)
      assert(left > right + 0.3, `${name}: dark tones get larger dots (${left} vs ${right})`)
      record("ramp", px)

      px = await render("gray", { ...BASE, level: 1, minDot: 0.3 })
      const levelSpecks = inked(px)
      assert(Math.abs(levelSpecks - Math.PI * 0.0225) < 0.03, `${name}: a high level keeps mid tones at the minimum speck (${levelSpecks})`)
      record("level", px)

      px = await render("red", { ...BASE, inkMode: "source" })
      close(at(px, 3, 3).slice(0, 3), [1, 0, 0], `${name}: source ink takes the image color`, 0.02)
      record("source ink", px)

      px = await render("gray", { ...BASE, maxDot: 0, underlay: 1 })
      close(at(px, 10, 10).slice(0, 3), [0.2, 0.2, 0.2], `${name}: full underlay shows the image`, 0.01)
      record("underlay", px)

      for (const style of DOT_GRID_STYLES) {
        px = await render("ramp", dotGridStyleParams(style))
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

export async function checkDotGrid(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const grid = { ...createLayer("dot-grid"), id: "grid" }
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
  const night = DOT_GRID_STYLES.find((s) => s.id === "night")
  for (const [key, value] of Object.entries(dotGridStyleParams(night)))
    store().updateLayerParam(grid.id, key, value)
  assert(matchDotGridStyle(store().getLayerById(grid.id).params) === "night", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchDotGridStyle(store().getLayerById(grid.id).params) === DEFAULT_DOT_GRID_STYLE.id,
    "History lost dot grid settings"
  )
  const duplicateId = store().duplicateLayer(grid.id)
  store().updateLayerParam(duplicateId, "shape", "square")
  assert(store().getLayerById(grid.id).params.shape === "circle", "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrid = reopened.layers.find((l) => l.id === grid.id)
  assert(
    reopenedGrid.type === "dot-grid" && matchDotGridStyle(reopenedGrid.params) === DEFAULT_DOT_GRID_STYLE.id,
    "Save/reopen changed the dot grid"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grid.id).type === "dot-grid", "Shader export type")
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
    "Exported runtime dot grid parity",
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
  for (const style of DOT_GRID_STYLES) {
    const base = createLayer("dot-grid")
    const rendered = await renderProject({
      ...saved,
      composition: { width: 756, height: 454 },
      assets: [asset],
      layers: [
        { ...base, id: "preview-grid", params: { ...base.params, ...dotGridStyleParams(style) } },
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
      { ...createLayer("dot-grid"), id: "catalog-grid" },
      { ...createLayer("image"), id: "photo", assetId: asset.id },
    ],
    selectedLayerId: "catalog-grid",
  })
  return { samples, styles, previewWebp: toWebp(catalog.image) }
}
