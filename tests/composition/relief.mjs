import { ReliefPass as RuntimeRelief } from "@runtime/renderer/relief-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { ReliefPass } from "@/renderer/relief-pass"
import {
  DEFAULT_RELIEF_STYLE,
  matchReliefStyle,
  RELIEF_STYLES,
  reliefStyleParams,
} from "@/lib/editor/config/relief-styles"
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
  relief: "emboss",
  heightFrom: "luminance",
  depth: 2,
  bevel: 2,
  amount: 1,
  lightAngle: 180,
  elevation: 40,
  ambient: 0.3,
  surface: "color",
  color: "#808080",
  specular: 0,
  shininess: 24,
  grain: 0,
  grainSize: 1.5,
  engrave: "none",
  engraveDepth: 0,
  lineSpacing: 8,
  engraveAngle: 0,
}

function unitChecks() {
  const entry = getLayerCatalogEntry("relief")
  assert(entry.label === "Relief" && entry.category === "core", "Catalog entry")
  const layer = createLayer("relief")
  assert(
    matchReliefStyle(layer.params) === DEFAULT_RELIEF_STYLE.id,
    "New layers start on the Silver Plate style"
  )
  for (const style of RELIEF_STYLES)
    assert(
      matchReliefStyle({ ...layer.params, ...reliefStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchReliefStyle({ ...layer.params, relief: "deboss" }) === "custom", "Deboss on Silver Plate shows Custom")
  assert(
    RELIEF_STYLES.some((s) => s.values.relief === "emboss") && RELIEF_STYLES.some((s) => s.values.relief === "deboss"),
    "Styles cover both emboss and deboss"
  )
  return 4 + RELIEF_STYLES.length
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
  const square = (x, y) => x >= 20 && x < 44 && y >= 20 && y < 44
  const inputs = {
    flat: makeInput(() => [0.3, 0.5, 0.2]),
    square: makeInput((x, y) => (square(x, y) ? [1, 1, 1] : [0, 0, 0])),
    disk: makeInput((x, y) =>
      Math.hypot(x - 31.5, y - 31.5) < 16 ? [0.6, 0.6, 0.6, 1] : [0.6, 0.6, 0.6, 0]
    ),
    depth: makeInput((x, y) => (square(x, y) ? [1, 1, 1] : [0, 0, 0])),
  }
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", ReliefPass],
      ["runtime", RuntimeRelief],
    ]) {
      const pass = new Pass(`relief-${name}`)
      pass.updateCompositionRole("effect")
      pass.flushColorNode()
      const render = async (input, params) => {
        pass.resize(N, N)
        pass.updateLogicalSize(N, N)
        pass.updateParams(params)
        pass.flushColorNode()
        pass.render(renderer, inputs[input], target, 0, 0)
        return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
      }
      const record = (label, pixels) => {
        results[label] ??= {}
        results[label][name] = pixels
        samples++
      }
      const at = (px, x, y) => px.slice((y * N + x) * 4, (y * N + x) * 4 + 4)
      const gray = linear(128 / 255)

      let px = await render("flat", { ...BASE, surface: "source" })
      close(px, Array.from(inputs.flat.image.data), `${name}: a flat surface in source colors is unchanged`, 0.002)
      record("flat identity", px)

      px = await render("square", { ...BASE, amount: 0 })
      close(px, Array.from(inputs.square.image.data), `${name}: amount 0 passes the image through`, 0.0005)

      px = await render("square", BASE)
      const flatShade = at(px, 5, 32)[0]
      assert(Math.abs(flatShade - gray) < 0.02, `${name}: flat areas keep the material color (${flatShade})`)
      const embossLeft = at(px, 20, 32)[0]
      const embossRight = at(px, 43, 32)[0]
      assert(
        embossLeft > flatShade + 0.05 && embossRight < flatShade - 0.05,
        `${name}: emboss lights the rim facing the light and shades the far rim (${embossLeft}, ${embossRight})`
      )
      record("emboss", px)

      px = await render("square", { ...BASE, relief: "deboss" })
      const debossLeft = at(px, 20, 32)[0]
      const debossRight = at(px, 43, 32)[0]
      assert(
        debossLeft < flatShade - 0.05 && debossRight > flatShade + 0.05,
        `${name}: deboss swaps the lit and shaded rims (${debossLeft}, ${debossRight})`
      )
      record("deboss", px)

      px = await render("square", { ...BASE, elevation: 12 })
      assert(at(px, 20, 32)[0] > embossLeft + 0.02, `${name}: a raking light strengthens the lit rim`)
      record("low light", px)

      px = await render("square", { ...BASE, lightAngle: 90 })
      assert(
        at(px, 32, 20)[0] > flatShade + 0.05 && at(px, 32, 43)[0] < flatShade - 0.05,
        `${name}: light from above lights the top rim`
      )
      record("light angle", px)

      px = await render("disk", { ...BASE, heightFrom: "alpha" })
      assert(
        at(px, 16, 32)[0] > flatShade + 0.05 && Math.abs(at(px, 32, 32)[0] - gray) < 0.02,
        `${name}: cutout height raises the shape by its alpha`
      )
      record("cutout", px)

      px = await render("flat", { ...BASE, heightFrom: "depth" })
      close(at(px, 32, 32).slice(0, 3), [gray, gray, gray], `${name}: depth without a map is flat`, 0.02)
      pass.setSceneDepth(inputs.depth)
      px = await render("flat", { ...BASE, heightFrom: "depth" })
      assert(at(px, 20, 32)[0] > flatShade + 0.05, `${name}: scene depth drives the relief over flat color`)
      pass.setSceneDepth(null)
      record("depth", px)

      px = await render("flat", { ...BASE, engrave: "parallel", engraveDepth: 1, lineSpacing: 8 })
      const row = Array.from({ length: N }, (_, x) => at(px, x, 32)[0])
      const variation = Math.max(...row) - Math.min(...row)
      assert(variation > 0.1, `${name}: engraving cuts visible lines (${variation})`)
      record("engrave", px)

      px = await render("flat", { ...BASE, grain: 1 })
      const grained = Array.from({ length: N }, (_, x) => at(px, x, 10)[0])
      assert(Math.max(...grained) - Math.min(...grained) > 0.05, `${name}: grain textures the surface`)
      record("grain", px)
      samples += 4

      for (const style of RELIEF_STYLES) {
        px = await render("square", reliefStyleParams(style))
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

export async function checkRelief(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const grid = { ...createLayer("relief"), id: "grid" }
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
  const letterpress = RELIEF_STYLES.find((s) => s.id === "letterpress")
  for (const [key, value] of Object.entries(reliefStyleParams(letterpress)))
    store().updateLayerParam(grid.id, key, value)
  assert(matchReliefStyle(store().getLayerById(grid.id).params) === "letterpress", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchReliefStyle(store().getLayerById(grid.id).params) === DEFAULT_RELIEF_STYLE.id,
    "History lost relief settings"
  )
  const duplicateId = store().duplicateLayer(grid.id)
  store().updateLayerParam(duplicateId, "relief", "deboss")
  assert(store().getLayerById(grid.id).params.relief === "emboss", "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrid = reopened.layers.find((l) => l.id === grid.id)
  assert(
    reopenedGrid.type === "relief" && matchReliefStyle(reopenedGrid.params) === DEFAULT_RELIEF_STYLE.id,
    "Save/reopen changed the relief"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grid.id).type === "relief", "Shader export type")
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
    "Exported runtime relief parity",
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
  for (const style of RELIEF_STYLES) {
    const base = createLayer("relief")
    const rendered = await renderProject({
      ...saved,
      composition: { width: 756, height: 454 },
      assets: [asset],
      layers:
        style.id === "letterpress"
          ? [
              { ...createLayer("group"), id: "type-group" },
              { ...base, id: "preview-grid", parentId: "type-group", params: { ...base.params, ...reliefStyleParams(style), heightFrom: "alpha", surface: "source" } },
              {
                ...createLayer("text"),
                id: "type",
                parentId: "type-group",
                params: { ...createLayer("text").params, text: "PRESS", fontSize: 190, textColor: "#efebe3" },
              },
              { ...createLayer("image"), id: "photo", assetId: asset.id },
            ]
          : [
              { ...base, id: "preview-grid", params: { ...base.params, ...reliefStyleParams(style) } },
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
      { ...createLayer("relief"), id: "catalog-grid" },
      { ...createLayer("image"), id: "photo", assetId: asset.id },
    ],
    selectedLayerId: "catalog-grid",
  })
  return { samples, styles, previewWebp: toWebp(catalog.image) }
}
