import { FlaresPass as RuntimeFlares } from "@runtime/renderer/flares-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { FlaresPass } from "@/renderer/flares-pass"
import {
  DEFAULT_FLARES_STYLE,
  FLARES_STYLES,
  flaresStyleParams,
  matchFlaresStyle,
} from "@/lib/editor/config/flares-styles"
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
  threshold: 0.8,
  isolation: 10,
  intensity: 4,
  rays: 4,
  rotation: 0,
  length: 28,
  secondaryLength: 1,
  lengthJitter: 0,
  thickness: 1,
  falloff: 1,
  seed: 0,
  color: "#ff7a3d",
  coreColor: "#ffffff",
  coreGlow: 0,
  coreSize: 4,
}

function unitChecks() {
  const entry = getLayerCatalogEntry("flares")
  assert(entry.label === "Flares" && entry.category === "core", "Catalog entry")
  const layer = createLayer("flares")
  assert(matchFlaresStyle(layer.params) === DEFAULT_FLARES_STYLE.id, "New layers start on the Cross style")
  for (const style of FLARES_STYLES)
    assert(
      matchFlaresStyle({ ...layer.params, ...flaresStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchFlaresStyle({ ...layer.params, rays: 5 }) === "custom", "Editing shows Custom")
  assert(
    matchFlaresStyle({ ...layer.params, threshold: 0.5 }) === DEFAULT_FLARES_STYLE.id,
    "Threshold is not part of a style"
  )
  return 4 + FLARES_STYLES.length
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
  const dot = (x, y) => Math.hypot(x - 31.5, y - 31.5) < 2
  const inputs = {
    dark: makeInput(() => [0.05, 0.05, 0.05]),
    dot: makeInput((x, y) => (dot(x, y) ? [1, 1, 1] : [0.02, 0.02, 0.02])),
    square: makeInput((x, y) =>
      x >= 20 && x < 44 && y >= 20 && y < 44 ? [1, 1, 1] : [0.02, 0.02, 0.02]
    ),
    clearDot: makeInput((x, y) => (dot(x, y) ? [1, 1, 1, 1] : [0, 0, 0, 0])),
  }
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", FlaresPass],
      ["runtime", RuntimeFlares],
    ]) {
      const pass = new Pass(`flares-${name}`)
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
      const at = (px, x, y) => px.slice((y * N + x) * 4, (y * N + x) * 4 + 4)
      const glow = (px, x, y) => at(px, x, y)[0]

      let px = await render("dark", BASE)
      close(px, Array.from(inputs.dark.image.data), `${name}: no bright points, no flares`, 0.0005)
      record("dark", px)

      px = await render("dot", BASE)
      const axis = Math.max(glow(px, 44, 32), glow(px, 20, 32), glow(px, 32, 44), glow(px, 32, 20))
      const diagonal = glow(px, 41, 41)
      assert(axis > 0.15 && axis > diagonal * 4, `${name}: four rays form a cross (${axis} vs ${diagonal})`)
      const far = glow(px, 60, 32)
      assert(far < glow(px, 40, 32), `${name}: rays fade toward their tips`)
      record("cross", px)

      px = await render("dot", { ...BASE, rotation: 45 })
      assert(glow(px, 41, 41) > glow(px, 44, 32) * 2, `${name}: rotation turns the cross`)
      record("rotation", px)

      px = await render("dot", { ...BASE, rays: 8 })
      assert(glow(px, 41, 41) > 0.05 && glow(px, 44, 32) > 0.05, `${name}: eight rays reach the diagonals too (${glow(px, 41, 41)}, ${glow(px, 44, 32)})`)
      record("star", px)

      px = await render("dot", { ...BASE, rays: 8, secondaryLength: 0.2 })
      assert(glow(px, 44, 44) < glow(px, 44, 32) * 0.5, `${name}: short secondary rays make a star`)
      record("secondary", px)

      px = await render("dot", { ...BASE, rays: 2 })
      assert(glow(px, 44, 32) > glow(px, 32, 44) * 4, `${name}: two rays make a single streak`)
      record("streak", px)

      const isolated = await render("square", BASE)
      const flooded = await render("square", { ...BASE, isolation: 0 })
      assert(
        glow(flooded, 32, 10) > glow(isolated, 32, 10) + 0.05,
        `${name}: isolation keeps large bright areas from flaring`
      )
      record("isolation", isolated)

      px = await render("dot", BASE)
      const near = at(px, 36, 32)
      const tail = at(px, 50, 32)
      assert(
        near[2] / Math.max(near[0], 0.001) > tail[2] / Math.max(tail[0], 0.001),
        `${name}: the core end of a ray is whiter than its colored tail`
      )
      samples++

      px = await render("clearDot", BASE)
      assert(at(px, 44, 32)[3] > 0.1 && at(px, 5, 5)[3] < 0.01, `${name}: flares add coverage over transparency`)
      record("transparent", px)

      px = await render("dot", { ...BASE, coreGlow: 2, coreSize: 6 })
      assert(glow(px, 36, 36) > glow(await render("dot", BASE), 36, 36), `${name}: core glow brightens around the point`)
      record("core", px)

      for (const style of FLARES_STYLES) {
        px = await render("dot", { ...BASE, ...flaresStyleParams(style) })
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

function previewLayers(style, base) {
  const flares = { ...base, id: "preview-grid", params: { ...base.params, ...flaresStyleParams(style) } }
  return [
    flares,
    ...[
      [-0.35, 0.18, 0.03],
      [0.05, -0.12, 0.022],
      [0.4, 0.22, 0.026],
      [0.15, 0.3, 0.015],
    ].map(([x, y, r], index) => ({
      ...createLayer("shape"),
      id: `spot-${index}`,
      params: {
        ...createLayer("shape").params,
        shape: "ellipse",
        center: [x, y],
        size: [r, r],
        color: "#ffffff",
        softness: 0.01,
      },
    })),
    solid("night", "#0b0d12"),
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

export async function checkFlares(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const grid = { ...createLayer("flares"), id: "grid" }
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
  const star = FLARES_STYLES.find((s) => s.id === "star")
  for (const [key, value] of Object.entries(flaresStyleParams(star)))
    store().updateLayerParam(grid.id, key, value)
  assert(matchFlaresStyle(store().getLayerById(grid.id).params) === "star", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchFlaresStyle(store().getLayerById(grid.id).params) === DEFAULT_FLARES_STYLE.id,
    "History lost flares settings"
  )
  const duplicateId = store().duplicateLayer(grid.id)
  store().updateLayerParam(duplicateId, "flares", "deboss")
  assert(store().getLayerById(grid.id).params.rays === 4, "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrid = reopened.layers.find((l) => l.id === grid.id)
  assert(
    reopenedGrid.type === "flares" && matchFlaresStyle(reopenedGrid.params) === DEFAULT_FLARES_STYLE.id,
    "Save/reopen changed the flares"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grid.id).type === "flares", "Shader export type")
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
    "Exported runtime flares parity",
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
  for (const style of FLARES_STYLES) {
    const base = createLayer("flares")
    const rendered = await renderProject({
      ...saved,
      composition: { width: 756, height: 454 },
      assets: [asset],
      layers: previewLayers(style, base),
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
      { ...createLayer("flares"), id: "catalog-grid" },
      { ...createLayer("image"), id: "photo", assetId: asset.id },
    ],
    selectedLayerId: "catalog-grid",
  })
  return { samples, styles, previewWebp: toWebp(catalog.image) }
}
