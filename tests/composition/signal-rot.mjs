import { SignalRotPass as RuntimeSignalRot } from "@runtime/renderer/signal-rot-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { SignalRotPass } from "@/renderer/signal-rot-pass"
import {
  DEFAULT_SIGNAL_ROT_STYLE,
  matchSignalRotStyle,
  SIGNAL_ROT_STYLES,
  signalRotStyleParams,
} from "@/lib/editor/config/signal-rot-styles"
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

const NEUTRAL = {
  direction: "vertical",
  drag: 0,
  dragLength: 0.3,
  stretch: 0,
  wobble: 0,
  wobbleScale: 0.5,
  tear: 0,
  bandSize: 0.12,
  dropout: 0,
  dropoutColor: "#ffffff",
  chroma: 0,
  crush: 0,
  lineNoise: 0,
  speed: 0,
  seed: 0,
}

function unitChecks() {
  const entry = getLayerCatalogEntry("signal-rot")
  assert(entry.label === "Signal Rot" && entry.category === "distort", "Catalog entry")
  const layer = createLayer("signal-rot")
  assert(
    matchSignalRotStyle(layer.params) === DEFAULT_SIGNAL_ROT_STYLE.id,
    "New layers start on the Scanner Drag style"
  )
  for (const style of SIGNAL_ROT_STYLES)
    assert(
      matchSignalRotStyle({ ...layer.params, ...signalRotStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchSignalRotStyle({ ...layer.params, tear: 0.99 }) === "custom", "Editing shows Custom")
  assert(
    matchSignalRotStyle({ ...layer.params, dropoutColor: "#FFFFFF" }) === DEFAULT_SIGNAL_ROT_STYLE.id,
    "Color matching ignores case"
  )
  return 4 + SIGNAL_ROT_STYLES.length
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
    along: makeInput((x, y) => [y, y, y]),
    across: makeInput((x, y) => [x, x, x]),
    rich: makeInput((x, y) => [x, (x * 3 + y * 5) % 1, y]),
  }
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", SignalRotPass],
      ["runtime", RuntimeSignalRot],
    ]) {
      const pass = new Pass(`signal-rot-${name}`)
      pass.updateCompositionRole("effect")
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
      const source = (input) => Array.from(inputs[input].image.data)
      const column = (pixels, x) => Array.from({ length: N }, (_, y) => pixels[(y * N + x) * 4])
      const row = (pixels, y) => Array.from({ length: N }, (_, x) => pixels[(y * N + x) * 4])
      const distinct = (values) => new Set(values.map((v) => v.toFixed(4))).size

      let px = await render("rich", NEUTRAL)
      close(px, source("rich"), `${name}: neutral settings are the identity`, 0.0005)
      record("identity", px)

      px = await render("along", { ...NEUTRAL, drag: 1, dragLength: 0.5 })
      const heldColumns = [4, 20, 40, 60].map((x) => distinct(column(px, x)))
      assert(
        heldColumns.every((count) => count <= 6),
        `${name}: full drag must hold columns into streaks (${heldColumns})`
      )
      record("vertical drag", px)

      px = await render("across", { ...NEUTRAL, direction: "horizontal", drag: 1, dragLength: 0.5 })
      const heldRows = [4, 30, 60].map((y) => distinct(row(px, y)))
      assert(heldRows.every((count) => count <= 6), `${name}: horizontal drag holds rows (${heldRows})`)
      record("horizontal drag", px)

      px = await render("across", { ...NEUTRAL, tear: 1, bandSize: 0.1 })
      const src = source("across")
      const shiftedRows = Array.from({ length: N }, (_, y) => y).filter((y) =>
        row(px, y).some((v, x) => Math.abs(v - src[(y * N + x) * 4]) > 0.02)
      ).length
      assert(shiftedRows > N * 0.2, `${name}: tear must shift bands (${shiftedRows} rows)`)
      record("tear", px)

      px = await render("rich", { ...NEUTRAL, dropout: 1, dropoutColor: "#ff0000", bandSize: 0.1 })
      let red = 0
      for (let i = 0; i < px.length; i += 4)
        if (px[i] > 0.99 && px[i + 1] < 0.01 && px[i + 2] < 0.01) red++
      assert(red > N * N * 0.1 && red < N * N, `${name}: dropout fills part of the bands (${red})`)
      record("dropout", px)

      px = await render("along", { ...NEUTRAL, chroma: 1 })
      const split = px[(32 * N + 32) * 4] - px[(32 * N + 32) * 4 + 1]
      assert(Math.abs(split) > 0.01, `${name}: chroma shift separates channels (${split})`)
      record("chroma", px)

      px = await render("rich", { ...NEUTRAL, crush: 1 })
      const levels = new Set()
      for (let i = 0; i < px.length; i += 4) levels.add(px[i].toFixed(3))
      assert(levels.size <= 4, `${name}: full crush leaves at most 4 levels (${levels.size})`)
      record("crush", px)

      px = await render("rich", { ...NEUTRAL, wobble: 1, wobbleScale: 0.3 })
      assert(px.every(Number.isFinite), `${name}: wobble output is finite`)
      record("wobble", px)

      const still = { ...NEUTRAL, lineNoise: 1 }
      const a = await render("rich", still, 0)
      const b = await render("rich", still, 3)
      close(a, b, `${name}: speed 0 keeps the damage fixed`, 0)
      assert(!pass.needsContinuousRender(), `${name}: static damage needs no continuous render`)
      const moving = { ...still, speed: 1 }
      const c = await render("rich", moving, 0)
      const d = await render("rich", moving, 1.3)
      assert(pass.needsContinuousRender(), `${name}: speed requests continuous render`)
      assert(c.some((v, i) => Math.abs(v - d[i]) > 0.01), `${name}: speed animates the rot`)
      record("line noise", c)
      samples += 2

      for (const style of SIGNAL_ROT_STYLES) {
        px = await render("rich", signalRotStyleParams(style), 0.5)
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

export async function checkSignalRot(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const rot = { ...createLayer("signal-rot"), id: "rot" }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [rot, stripes("field")],
    selectedLayerId: rot.id,
    composition: { width: N, height: N },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const store = () => useLayerStore.getState()
  const before = buildEditorHistorySnapshot()
  const tape = SIGNAL_ROT_STYLES.find((s) => s.id === "signal-rot")
  for (const [key, value] of Object.entries(signalRotStyleParams(tape)))
    store().updateLayerParam(rot.id, key, value)
  assert(matchSignalRotStyle(store().getLayerById(rot.id).params) === "signal-rot", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchSignalRotStyle(store().getLayerById(rot.id).params) === DEFAULT_SIGNAL_ROT_STYLE.id,
    "History lost signal rot settings"
  )
  const duplicateId = store().duplicateLayer(rot.id)
  store().updateLayerParam(duplicateId, "direction", "horizontal")
  assert(store().getLayerById(rot.id).params.direction === "vertical", "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedRot = reopened.layers.find((l) => l.id === rot.id)
  assert(
    reopenedRot.type === "signal-rot" && matchSignalRotStyle(reopenedRot.params) === DEFAULT_SIGNAL_ROT_STYLE.id,
    "Save/reopen changed the signal rot"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === rot.id).type === "signal-rot", "Shader export type")
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
    "Exported runtime signal rot parity",
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
  for (const style of SIGNAL_ROT_STYLES) {
    const base = createLayer("signal-rot")
    const rendered = await renderProject({
      ...saved,
      composition: { width: 756, height: 454 },
      assets: [asset],
      layers: [
        { ...base, id: "preview-rot", params: { ...base.params, ...signalRotStyleParams(style) } },
        { ...createLayer("image"), id: "photo", assetId: asset.id },
      ],
      selectedLayerId: "preview-rot",
    })
    styles[style.id] = rendered.png
    samples++
  }
  const catalog = await renderProject({
    ...saved,
    composition: { width: 480, height: 600 },
    assets: [asset],
    layers: [
      { ...createLayer("signal-rot"), id: "catalog-rot" },
      { ...createLayer("image"), id: "photo", assetId: asset.id },
    ],
    selectedLayerId: "catalog-rot",
  })
  return { samples, styles, previewWebp: toWebp(catalog.image) }
}
