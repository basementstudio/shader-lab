import { OutlinePass as RuntimeOutline } from "@runtime/renderer/outline-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { OutlinePass } from "@/renderer/outline-pass"
import {
  DEFAULT_OUTLINE_STYLE,
  matchOutlineStyle,
  OUTLINE_STYLES,
  outlineStyleParams,
} from "@/lib/editor/config/outline-styles"
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
  source: "alpha",
  threshold: 0.5,
  style: "solid",
  offset: 8,
  width: 2,
  rings: 1,
  ringGap: 8,
  spacing: 16,
  lineColor: "#ff0000",
  fill: 0,
  fillColor: "#0000ff",
  showImage: true,
}

function unitChecks() {
  const entry = getLayerCatalogEntry("outline")
  assert(entry.label === "Outline" && entry.category === "core", "Catalog entry")
  const layer = createLayer("outline")
  assert(matchOutlineStyle(layer.params) === DEFAULT_OUTLINE_STYLE.id, "New layers start on Stroke")
  for (const style of OUTLINE_STYLES)
    assert(
      matchOutlineStyle({ ...layer.params, ...outlineStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchOutlineStyle({ ...layer.params, width: 9 }) === "custom", "Editing shows Custom")
  return 3 + OUTLINE_STYLES.length
}

function makeInput(fn) {
  const data = new Float32Array(S * S * 4)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) data.set(fn(x, y), (y * S + x) * 4)
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.FloatType)
  tex.needsUpdate = true
  return tex
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const R = 24
  const inputs = {
    disk: makeInput((x, y) => (Math.hypot(x + 0.5 - 64, y + 0.5 - 64) < R ? [0, 1, 0, 1] : [0, 0, 0, 0])),
    darkDisk: makeInput((x, y) => (Math.hypot(x + 0.5 - 64, y + 0.5 - 64) < R ? [0, 0, 0, 1] : [1, 1, 1, 1])),
  }
  const target = new THREE.RenderTarget(S, S, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", OutlinePass],
      ["runtime", RuntimeOutline],
    ]) {
      const pass = new Pass(`outline-${name}`)
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
      const red = (p) => p[0] > 0.45 && p[0] > p[1] + 0.1 && p[3] > 0.4
      const ringAt = (px, radius) => [0, 1, 2, 3].map((k) => {
        const a = (k * Math.PI) / 2
        return at(px, Math.round(64 + Math.cos(a) * radius - 0.5), Math.round(64 + Math.sin(a) * radius - 0.5))
      })

      let px = await render("disk", BASE)
      assert(ringAt(px, R + 8).every(red), `${name}: solid outline sits at the offset (${JSON.stringify(ringAt(px, R + 8))})`)
      assert(!red(at(px, 64, 64)) && at(px, 64, 64)[1] > 0.9, `${name}: the shape stays visible inside`)
      assert(at(px, 2, 2)[3] < 0.01, `${name}: far outside stays transparent`)
      assert(!ringAt(px, R + 3).some(red), `${name}: the gap before the outline is clear`)
      record("solid", px)

      px = await render("disk", { ...BASE, rings: 3, ringGap: 10 })
      assert(ringAt(px, R + 18).every(red) && ringAt(px, R + 28).every(red), `${name}: rings repeat outward`)
      record("rings", px)

      px = await render("disk", { ...BASE, offset: -6 })
      assert(ringAt(px, R - 6).every(red), `${name}: negative offset draws inside (${JSON.stringify([R - 8, R - 7, R - 6, R - 5, R - 4].map((r) => at(px, 64 + r, 64)))})`)
      record("inside", px)

      px = await render("disk", { ...BASE, fill: 1 })
      assert(at(px, 64 + R + 3, 64)[2] > 0.9, `${name}: fill paints between shape and outline`)
      record("fill", px)

      px = await render("disk", { ...BASE, showImage: false })
      assert(at(px, 64, 64)[3] < 0.01 && ringAt(px, R + 8).every(red), `${name}: show image off keeps only the line`)
      record("line only", px)

      px = await render("disk", { ...BASE, style: "scalloped", offset: 10, spacing: 16, fill: 1 })
      const cloud = Array.from({ length: 64 }, (_, k) => {
        const a = (k / 64) * Math.PI * 2
        let r = R
        while (r < R + 40 && !red(at(px, Math.round(64 + Math.cos(a) * r - 0.5), Math.round(64 + Math.sin(a) * r - 0.5)))) r += 0.5
        return r
      })
      assert(Math.max(...cloud) - Math.min(...cloud) > 2 && Math.max(...cloud) < R + 40, `${name}: scalloped outline bulges like a cloud (${Math.min(...cloud)}..${Math.max(...cloud)})`)
      record("scalloped", px)

      px = await render("disk", { ...BASE, style: "dashed", spacing: 10 })
      const around = Array.from({ length: 96 }, (_, k) => {
        const a = (k / 96) * Math.PI * 2
        return red(at(px, Math.round(64 + Math.cos(a) * (R + 8) - 0.5), Math.round(64 + Math.sin(a) * (R + 8) - 0.5)))
      })
      const on = around.filter(Boolean).length
      assert(on > 15 && on < 85, `${name}: dashes break the outline (${on}/96)`)
      record("dashed", px)

      px = await render("disk", { ...BASE, style: "double", offset: 6 })
      record("double", px)

      px = await render("darkDisk", { ...BASE, source: "dark" })
      assert(ringAt(px, R + 8).every(red), `${name}: dark shapes can be outlined`)
      record("dark", px)
      samples += 6

      for (const style of OUTLINE_STYLES) {
        px = await render("disk", outlineStyleParams(style))
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

function previewLayers(style, base) {
  const text = createLayer("text")
  return [
    { ...createLayer("group"), id: "type-group" },
    { ...base, id: "preview-grid", parentId: "type-group", params: { ...base.params, ...outlineStyleParams(style) } },
    {
      ...text,
      id: "type",
      parentId: "type-group",
      params: { ...text.params, text: "CLOUD", fontSize: 200, textColor: "#e8452c" },
    },
    solid("paper", "#e9e5dc"),
  ]
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



export async function checkOutline(renderProject) {
  let samples = unitChecks()
  let passFailure = null
  try {
    samples += await passChecks()
  } catch (error) {
    passFailure = error
  }

  const grid = { ...createLayer("outline"), id: "grid" }
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
  const cloud = OUTLINE_STYLES.find((s) => s.id === "cloud")
  for (const [key, value] of Object.entries(outlineStyleParams(cloud)))
    store().updateLayerParam(grid.id, key, value)
  assert(matchOutlineStyle(store().getLayerById(grid.id).params) === "cloud", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchOutlineStyle(store().getLayerById(grid.id).params) === DEFAULT_OUTLINE_STYLE.id,
    "History lost outline settings"
  )
  const duplicateId = store().duplicateLayer(grid.id)
  store().updateLayerParam(duplicateId, "outline", "deboss")
  assert(store().getLayerById(grid.id).params.lineColor === "#111111", "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrid = reopened.layers.find((l) => l.id === grid.id)
  assert(
    reopenedGrid.type === "outline" && matchOutlineStyle(reopenedGrid.params) === DEFAULT_OUTLINE_STYLE.id,
    "Save/reopen changed the outline"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grid.id).type === "outline", "Shader export type")
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
    "Exported runtime outline parity",
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
  for (const style of OUTLINE_STYLES) {
    const base = createLayer("outline")
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
      { ...createLayer("outline"), id: "dof" },
      studyImage,
    ],
    selectedLayerId: "dof",
  })
  styles["study-forms"] = dof.png
  samples++
  return { samples, styles, previewWebp: toWebp(dof.image), failure: passFailure?.message }
}
