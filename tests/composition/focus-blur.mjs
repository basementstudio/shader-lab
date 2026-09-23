import { FocusBlurPass as RuntimeFocusBlur } from "@runtime/renderer/focus-blur-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { FocusBlurPass } from "@/renderer/focus-blur-pass"
import {
  DEFAULT_FOCUS_BLUR_STYLE,
  FOCUS_BLUR_STYLES,
  focusBlurStyleParams,
  matchFocusBlurStyle,
} from "@/lib/editor/config/focus-blur-styles"
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
  blurFrom: "uniform",
  kind: "gaussian",
  radius: 0,
  focus: 0.5,
  range: 0.2,
  transition: 0.2,
  center: [0, 0],
  angle: 0,
  invertFocus: false,
  motionAngle: 0,
  highlights: 0,
  grain: 0,
  grainSize: 1.2,
  grainFollow: 0,
}

function unitChecks() {
  const entry = getLayerCatalogEntry("focus-blur")
  assert(entry.label === "Blur" && entry.category === "core", "Catalog entry")
  const layer = createLayer("focus-blur")
  assert(matchFocusBlurStyle(layer.params) === DEFAULT_FOCUS_BLUR_STYLE.id, "New layers start on Depth of Field")
  for (const style of FOCUS_BLUR_STYLES)
    assert(
      matchFocusBlurStyle({ ...layer.params, ...focusBlurStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchFocusBlurStyle({ ...layer.params, radius: 3 }) === "custom", "Editing shows Custom")
  return 3 + FOCUS_BLUR_STYLES.length
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
    split: makeInput((x) => (x < S / 2 ? [0, 0, 0] : [1, 1, 1])),
    flat: makeInput(() => [0.3, 0.6, 0.2]),
    checker: makeInput(checker),
    dot: makeInput((x, y) => (Math.hypot(x - 63.5, y - 63.5) < 2 ? [1, 1, 1] : [0, 0, 0])),
    square: makeInput((x, y) =>
      x >= 44 && x < 84 && y >= 44 && y < 84 ? [1, 0.2, 0.1, 1] : [0, 0, 0, 0]
    ),
    depth: makeInput((x) => (x < S / 2 ? [1, 1, 1] : [0, 0, 0])),
  }
  const target = new THREE.RenderTarget(S, S, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", FocusBlurPass],
      ["runtime", RuntimeFocusBlur],
    ]) {
      const pass = new Pass(`focus-blur-${name}`)
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
      const width = (profile) => profile.filter((v) => v > 0.1 && v < 0.9).length
      const variance = (px, y) => {
        const values = row(px, y).slice(16, 112)
        const mean = values.reduce((a, b) => a + b, 0) / values.length
        return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
      }

      let px = await render("checker", BASE)
      close(px, Array.from(inputs.checker.image.data), `${name}: radius 0 is the identity`, 0.002)
      record("identity", px)

      px = await render("flat", { ...BASE, radius: 120 })
      close(at(px, 64, 64), [0.3, 0.6, 0.2, 1], `${name}: a flat color stays flat under a large blur`, 0.01)
      record("flat", px)

      const widths = []
      for (const radius of [4, 12, 36, 100]) {
        px = await render("split", { ...BASE, radius })
        const profile = row(px, 64)
        widths.push(width(profile))
        const steps = profile.slice(1).map((v, i) => v - profile[i])
        assert(steps.every((d) => d > -0.004), `${name}: radius ${radius} edge rises without ringing`)
        const bends = steps.slice(1).map((d, i) => Math.abs(d - steps[i]))
        assert(Math.max(...bends) < 0.06, `${name}: radius ${radius} edge is smooth (${Math.max(...bends)})`)
        record(`split ${radius}`, px)
      }
      assert(
        widths.every((w, i) => i === 0 || w > widths[i - 1]),
        `${name}: larger radii blur wider (${widths})`
      )

      px = await render("checker", { ...BASE, blurFrom: "linear", radius: 20, range: 0.2, transition: 0.2 })
      assert(variance(px, 64) > variance(px, 8) * 5, `${name}: linear keeps a sharp band`)
      record("linear", px)
      px = await render("checker", { ...BASE, blurFrom: "linear", radius: 20, range: 0.2, transition: 0.2, invertFocus: true })
      assert(variance(px, 8) > variance(px, 64) * 5, `${name}: invert focus blurs the band instead`)
      record("invert", px)
      px = await render("checker", { ...BASE, blurFrom: "radial", radius: 20, range: 0.3, transition: 0.2 })
      assert(variance(px, 64) > variance(px, 6) * 3, `${name}: radial keeps a sharp spot`)
      record("radial", px)

      px = await render("checker", { ...BASE, blurFrom: "depth", radius: 20, focus: 1, range: 0.1, transition: 0.2 })
      close(px, Array.from(inputs.checker.image.data), `${name}: depth without a map stays sharp`, 0.002)
      pass.setSceneDepth(inputs.depth)
      px = await render("checker", { ...BASE, blurFrom: "depth", radius: 20, focus: 1, range: 0.1, transition: 0.2 })
      const leftVar = variance(px.map((v, i) => ((i / 4) % S < S / 2 ? v : 0.5)), 64)
      const sharpLeft = at(px, 20, 64)[0]
      const blurredRight = at(px, 100, 64)[0]
      assert(
        Math.abs(sharpLeft - Math.round(sharpLeft)) < 0.02 && Math.abs(blurredRight - 0.5) < 0.15 && leftVar > 0,
        `${name}: depth keeps near sharp and blurs far (${sharpLeft}, ${blurredRight})`
      )
      pass.setSceneDepth(null)
      record("depth", px)

      px = await render("dot", { ...BASE, kind: "lens", radius: 20 })
      const lensCenter = at(px, 64, 64)[0]
      const lensMid = at(px, 64 + 12, 64)[0]
      const gauss = await render("dot", { ...BASE, radius: 20 })
      const gaussRatio = at(gauss, 64 + 12, 64)[0] / Math.max(at(gauss, 64, 64)[0], 1e-5)
      assert(lensMid / Math.max(lensCenter, 1e-5) > gaussRatio, `${name}: lens bokeh is flatter than a gaussian`)
      record("lens", px)

      px = await render("dot", { ...BASE, kind: "motion", radius: 30, motionAngle: 0 })
      assert(at(px, 64 + 20, 64)[0] > at(px, 64, 64 + 20)[0] * 4, `${name}: motion streaks along its angle`)
      record("motion", px)

      px = await render("square", { ...BASE, radius: 16 })
      const outside = at(px, 40, 64)
      assert(outside[3] > 0.05 && outside[3] < 0.95, `${name}: blur spreads coverage past the edge (${outside[3]})`)
      assert(Math.abs(outside[0] - 1) < 0.02 && Math.abs(outside[1] - 0.2) < 0.02, `${name}: no dark fringe on blurred edges (${outside})`)
      record("alpha", px)

      px = await render("flat", { ...BASE, grain: 1 })
      const grained = row(px, 30)
      assert(Math.max(...grained) - Math.min(...grained) > 0.05, `${name}: grain adds texture`)
      record("grain", px)
      samples += 3

      for (const style of FOCUS_BLUR_STYLES) {
        px = await render("checker", focusBlurStyleParams(style))
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
    { ...base, id: "preview-grid", params: { ...base.params, ...focusBlurStyleParams(style) } },
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



export async function checkFocusBlur(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const grid = { ...createLayer("focus-blur"), id: "grid" }
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
  const tilt = FOCUS_BLUR_STYLES.find((s) => s.id === "tilt-shift")
  for (const [key, value] of Object.entries(focusBlurStyleParams(tilt)))
    store().updateLayerParam(grid.id, key, value)
  assert(matchFocusBlurStyle(store().getLayerById(grid.id).params) === "tilt-shift", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchFocusBlurStyle(store().getLayerById(grid.id).params) === DEFAULT_FOCUS_BLUR_STYLE.id,
    "History lost focus blur settings"
  )
  const duplicateId = store().duplicateLayer(grid.id)
  store().updateLayerParam(duplicateId, "focus-blur", "deboss")
  assert(store().getLayerById(grid.id).params.kind === "lens", "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrid = reopened.layers.find((l) => l.id === grid.id)
  assert(
    reopenedGrid.type === "focus-blur" && matchFocusBlurStyle(reopenedGrid.params) === DEFAULT_FOCUS_BLUR_STYLE.id,
    "Save/reopen changed the focus blur"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grid.id).type === "focus-blur", "Shader export type")
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
    "Exported runtime focus blur parity",
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
  for (const style of FOCUS_BLUR_STYLES) {
    const base = createLayer("focus-blur")
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
      { ...createLayer("focus-blur"), id: "dof" },
      studyImage,
    ],
    selectedLayerId: "dof",
  })
  styles["study-depth-of-field"] = dof.png
  samples++
  return { samples, styles, previewWebp: toWebp(dof.image) }
}
