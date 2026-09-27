import { PhotocopyPass as RuntimeCopy } from "@runtime/renderer/photocopy-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { PhotocopyPass } from "@/renderer/photocopy-pass"
import {
  DEFAULT_PHOTOCOPY_STYLE,
  matchPhotocopyStyle,
  PHOTOCOPY_STYLES,
  photocopyStyleParams,
} from "@/lib/editor/config/photocopy-styles"
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
  threshold: 0.5,
  contrast: 1,
  generations: 1,
  amount: 1,
  fill: 0,
  speckle: 0,
  streaks: 0,
  shift: 0,
  grain: 0,
  creases: 0,
  seed: 0,
  tonerColor: "#000000",
  paper: "color",
  paperColor: "#ffffff",
}

function unitChecks() {
  const entry = getLayerCatalogEntry("photocopy")
  assert(entry.label === "Photocopy" && entry.category === "core", "Catalog entry")
  const layer = createLayer("photocopy")
  assert(matchPhotocopyStyle(layer.params) === DEFAULT_PHOTOCOPY_STYLE.id, "New layers start on Office Copy")
  for (const style of PHOTOCOPY_STYLES)
    assert(
      matchPhotocopyStyle({ ...layer.params, ...photocopyStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchPhotocopyStyle({ ...layer.params, speckle: 0.99 }) === "custom", "Editing shows Custom")
  return 3 + PHOTOCOPY_STYLES.length
}

function makeInput(fn) {
  const data = new Float32Array(S * S * 4)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) data.set([...fn(x, y), 1], (y * S + x) * 4)
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
    ramp: makeInput((x) => [x / (S - 1), x / (S - 1), x / (S - 1)]),
    edge: makeInput((x) => (x < 64 ? [0, 0, 0] : [1, 1, 1])),
  }
  const target = new THREE.RenderTarget(S, S, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", PhotocopyPass],
      ["runtime", RuntimeCopy],
    ]) {
      const pass = new Pass(`copy-${name}`)
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
      const inked = (px) => {
        let total = 0
        for (let i = 0; i < px.length; i += 4) total += 1 - px[i + 1]
        return total / (px.length / 4)
      }
      const at = (px, x, y) => px[(y * S + x) * 4]

      let px = await render("white", BASE)
      assert(inked(px) < 0.001, `${name}: clean white paper stays blank`)
      px = await render("black", BASE)
      assert(inked(px) > 0.99, `${name}: black becomes solid toner`)
      record("black", px)

      px = await render("ramp", BASE)
      const values = new Set()
      for (let i = 0; i < px.length; i += 4) values.add(px[i].toFixed(1))
      assert(values.size <= 6, `${name}: full contrast crushes the ramp to toner and paper (${values.size})`)
      record("crush", px)
      const soft = await render("ramp", { ...BASE, contrast: 0 })
      const softValues = new Set()
      for (let i = 0; i < soft.length; i += 4) softValues.add(soft[i].toFixed(1))
      assert(softValues.size > values.size, `${name}: low contrast keeps grays`)

      px = await render("white", { ...BASE, speckle: 1 })
      assert(inked(px) > 0.003 && inked(px) < 0.1, `${name}: speckle drops toner dust on paper (${inked(px)})`)
      record("speckle", px)

      px = await render("white", { ...BASE, streaks: 1 })
      assert(inked(px) > 0.005, `${name}: streaks draw drum lines`)
      record("streaks", px)

      const sharp = await render("edge", BASE)
      const shifted = await render("edge", { ...BASE, shift: 8 })
      assert(at(sharp, 66, 64) > 0.9 && at(shifted, 66, 64) < 0.1, `${name}: misregistration slides the copy`)
      record("shift", shifted)

      const one = await render("edge", BASE)
      const many = await render("edge", { ...BASE, generations: 6, contrast: 0.3 })
      assert(one.some((v, i) => Math.abs(v - many[i]) > 0.1), `${name}: generations degrade the copy`)
      record("generations", many)

      px = await render("white", { ...BASE, creases: 1 })
      assert(inked(px) > 0.005, `${name}: creases mark the paper`)
      record("creases", px)

      px = await render("black", { ...BASE, paper: "transparent", speckle: 1 })
      const alphas = px.filter((_, i) => i % 4 === 3)
      assert(Math.min(...alphas) < 0.01 && Math.max(...alphas) > 0.99, `${name}: transparent paper keeps only toner`)
      record("transparent", px)
      samples += 4

      for (const style of PHOTOCOPY_STYLES) {
        px = await render("ramp", photocopyStyleParams(style))
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
    { ...base, id: "preview-grid", params: { ...base.params, ...photocopyStyleParams(style) } },
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



export async function checkPhotocopy(renderProject) {
  let samples = unitChecks()
  let passFailure = null
  try {
    samples += await passChecks()
  } catch (error) {
    passFailure = error
  }

  const grid = { ...createLayer("photocopy"), id: "grid" }
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
  const zine = PHOTOCOPY_STYLES.find((s) => s.id === "zine")
  for (const [key, value] of Object.entries(photocopyStyleParams(zine)))
    store().updateLayerParam(grid.id, key, value)
  assert(matchPhotocopyStyle(store().getLayerById(grid.id).params) === "zine", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchPhotocopyStyle(store().getLayerById(grid.id).params) === DEFAULT_PHOTOCOPY_STYLE.id,
    "History lost photocopy settings"
  )
  const duplicateId = store().duplicateLayer(grid.id)
  store().updateLayerParam(duplicateId, "photocopy", "deboss")
  assert(store().getLayerById(grid.id).params.tonerColor === "#141414", "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrid = reopened.layers.find((l) => l.id === grid.id)
  assert(
    reopenedGrid.type === "photocopy" && matchPhotocopyStyle(reopenedGrid.params) === DEFAULT_PHOTOCOPY_STYLE.id,
    "Save/reopen changed the photocopy"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grid.id).type === "photocopy", "Shader export type")
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
    "Exported runtime photocopy parity",
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
  for (const style of PHOTOCOPY_STYLES) {
    const base = createLayer("photocopy")
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
      { ...createLayer("photocopy"), id: "dof" },
      studyImage,
    ],
    selectedLayerId: "dof",
  })
  styles["study-forms"] = dof.png
  samples++
  return { samples, styles, previewWebp: toWebp(dof.image), failure: passFailure?.message }
}
