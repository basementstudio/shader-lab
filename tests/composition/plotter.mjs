import { PlotterPass as RuntimePlotter } from "@runtime/renderer/plotter-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { PlotterPass } from "@/renderer/plotter-pass"
import {
  DEFAULT_PLOTTER_STYLE,
  matchPlotterStyle,
  PLOTTER_STYLES,
  plotterStyleParams,
} from "@/lib/editor/config/plotter-styles"
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
  mode: "hatch",
  gap: 8,
  weight: 1.5,
  pressure: 0,
  angle: 90,
  crosshatch: false,
  crossAngle: 0,
  threshold: 0.5,
  wobble: 0,
  levels: 6,
  smoothing: 2,
  amplitude: 0.8,
  frequency: 0.5,
  center: [0, 0],
  bleed: 0,
  colorMode: "ink",
  inkColor: "#000000",
  pen2Color: "#ff0000",
  pen3Color: "#0000ff",
  paper: "color",
  paperColor: "#ffffff",
  paperGrain: 0,
}

function unitChecks() {
  const entry = getLayerCatalogEntry("plotter")
  assert(entry.label === "Plotter" && entry.category === "core", "Catalog entry")
  const layer = createLayer("plotter")
  assert(matchPlotterStyle(layer.params) === DEFAULT_PLOTTER_STYLE.id, "New layers start on Crosshatch")
  const legacy = {
    gap: 12,
    weight: 1.5,
    angle: 90,
    crosshatch: true,
    crossAngle: 135,
    threshold: 0.5,
    wobble: 0.3,
    paperColor: "#f5f0e8",
    inkColor: "#1a1a1a",
    colorMode: "ink",
  }
  for (const [key, value] of Object.entries(legacy))
    assert(layer.params[key] === value, `Legacy default ${key} is unchanged`)
  for (const style of PLOTTER_STYLES)
    assert(
      matchPlotterStyle({ ...layer.params, ...plotterStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchPlotterStyle({ ...layer.params, gap: 40 }) === "custom", "Editing shows Custom")
  return 3 + Object.keys(legacy).length + PLOTTER_STYLES.length
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
    dark: makeInput(() => [0.03, 0.03, 0.03]),
    ramp: makeInput((x) => [x / (S - 1), x / (S - 1), x / (S - 1)]),
    disk: makeInput((x, y) => {
      const r = Math.hypot(x - 63.5, y - 63.5)
      const v = Math.min(1, Math.max(0, (r - 10) / 40))
      return [v, v, v]
    }),
  }
  const target = new THREE.RenderTarget(S, S, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", PlotterPass],
      ["runtime", RuntimePlotter],
    ]) {
      const pass = new Pass(`plotter-${name}`)
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

      for (const mode of ["hatch", "flow", "contour", "squiggle", "spiral", "stipple"]) {
        const blank = await render("white", { ...BASE, mode })
        assert(
          inked(blank) < (mode === "squiggle" ? 0.25 : 0.02),
          `${name}: ${mode} leaves white paper nearly blank (${inked(blank)})`
        )
        const drawn = await render(mode === "contour" || mode === "flow" ? "disk" : "ramp", { ...BASE, mode })
        assert(drawn.every(Number.isFinite) && inked(drawn) > 0.02, `${name}: ${mode} draws strokes (${inked(drawn)})`)
        record(`mode ${mode}`, drawn)
      }

      const single = await render("black", BASE)
      const lineShare = inked(single)
      assert(Math.abs(lineShare - 1.5 / 8) < 0.07, `${name}: hatch lines cover width over spacing (${lineShare})`)
      const cross = await render("black", { ...BASE, crosshatch: true, crossAngle: 0 })
      assert(inked(cross) > lineShare + 0.08, `${name}: crosshatch adds layers in the dark (${inked(cross)})`)
      record("crosshatch", cross)

      const ramp = await render("ramp", { ...BASE, crosshatch: true, crossAngle: 0 })
      assert(inked(ramp, 0, 40) > inked(ramp, 88, S) + 0.05, `${name}: darker tones get more ink`)
      record("hatch ramp", ramp)

      const light = await render("black", { ...BASE, pressure: 0 })
      const pressed = await render("black", { ...BASE, pressure: 1 })
      assert(inked(pressed) > inked(light) + 0.05, `${name}: pressure widens strokes in the dark`)
      record("pressure", pressed)

      const wobbly = await render("black", { ...BASE, wobble: 1 })
      assert(light.some((v, i) => Math.abs(v - wobbly[i]) > 0.2), `${name}: wobble bends the strokes`)
      record("wobble", wobbly)

      const flat = await render("dark", { ...BASE, mode: "squiggle", amplitude: 0 })
      const wavy = await render("dark", { ...BASE, mode: "squiggle", amplitude: 1 })
      assert(flat.some((v, i) => Math.abs(v - wavy[i]) > 0.2), `${name}: squiggle amplitude waves the rows`)
      record("squiggle", wavy)

      const pens = await render("black", { ...BASE, colorMode: "pens", crosshatch: true, crossAngle: 0 })
      let reddish = 0
      for (let i = 0; i < pens.length; i += 4) if (pens[i] > 0.5 && pens[i + 2] < 0.3) reddish++
      assert(reddish > 20, `${name}: three pens draws layers in their own colors (${reddish})`)
      record("pens", pens)

      const clear = await render("black", { ...BASE, paper: "transparent" })
      const alphas = clear.filter((_, i) => i % 4 === 3)
      assert(Math.min(...alphas) < 0.01 && Math.max(...alphas) > 0.6, `${name}: transparent paper keeps only the ink (${Math.min(...alphas)} ${Math.max(...alphas)})`)
      record("transparent", clear)
      samples += 6

      for (const style of PLOTTER_STYLES) {
        const px = await render("disk", plotterStyleParams(style))
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
    { ...base, id: "preview-grid", params: { ...base.params, ...plotterStyleParams(style) } },
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



export async function checkPlotter(renderProject) {
  let samples = unitChecks()
  let passFailure = null
  try {
    samples += await passChecks()
  } catch (error) {
    passFailure = error
  }

  const grid = { ...createLayer("plotter"), id: "grid" }
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
  const spiral = PLOTTER_STYLES.find((s) => s.id === "spiral")
  for (const [key, value] of Object.entries(plotterStyleParams(spiral)))
    store().updateLayerParam(grid.id, key, value)
  assert(matchPlotterStyle(store().getLayerById(grid.id).params) === "spiral", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchPlotterStyle(store().getLayerById(grid.id).params) === DEFAULT_PLOTTER_STYLE.id,
    "History lost plotter settings"
  )
  const duplicateId = store().duplicateLayer(grid.id)
  store().updateLayerParam(duplicateId, "plotter", "deboss")
  assert(store().getLayerById(grid.id).params.mode === "hatch", "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrid = reopened.layers.find((l) => l.id === grid.id)
  assert(
    reopenedGrid.type === "plotter" && matchPlotterStyle(reopenedGrid.params) === DEFAULT_PLOTTER_STYLE.id,
    "Save/reopen changed the plotter"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grid.id).type === "plotter", "Shader export type")
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
    "Exported runtime plotter parity",
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
  for (const style of PLOTTER_STYLES) {
    const base = createLayer("plotter")
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
      { ...createLayer("plotter"), id: "dof" },
      studyImage,
    ],
    selectedLayerId: "dof",
  })
  styles["study-forms"] = dof.png
  samples++
  return { samples, styles, previewWebp: toWebp(dof.image), failure: passFailure?.message }
}
