import { ShapePass as RuntimeShapePass } from "@runtime/renderer/shape-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { ShapePass } from "@/renderer/shape-pass"
import {
  applySvgPalette,
  extractSvgColors,
  parseSvgPalette,
  readSvgAspect,
  serializeSvgPalette,
} from "@/renderer/svg-palette"
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
const N = 96
const index = (v) => Math.min(N - 1, Math.max(0, Math.round((v + 0.5) * N - 0.5)))
const TWO_TONE = "/scenes/default/shape-two-tone.svg"
const WIDE = "/scenes/default/shape-wide.svg"

function unitChecks() {
  const pinwheel = `<svg viewBox="0 0 200 100"><style>.a { fill: #ABC }</style><path d="M0 0" fill="red"/><path d="M1 1" style="stroke: rgb(0, 0, 255); fill:none"/><linearGradient><stop stop-color="#00ff00"/></linearGradient><circle r="3"/></svg>`
  const colors = extractSvgColors(pinwheel)
  assert(
    colors.join() === "#ff0000,#00ff00,#aabbcc,#0000ff",
    `Colors come from attributes, styles and gradient stops, got ${colors}`
  )
  const implicit = extractSvgColors(`<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`)
  assert(implicit.join() === "#000000", `A shape without fill lists the implicit black, got ${implicit}`)
  const recolored = applySvgPalette(
    `<svg viewBox="0 0 10 10"><rect fill="#FF0000"/><rect style="fill: red"/><rect/></svg>`,
    { "#ff0000": "#123456", "#000000": "#abcdef" }
  )
  assert(
    recolored.includes('fill="#123456"') &&
      recolored.includes("fill:#123456") &&
      recolored.includes('<svg viewBox="0 0 10 10" fill="#abcdef">'),
    `Palette rewrites attributes, styles and the implicit fill, got ${recolored}`
  )
  assert(
    serializeSvgPalette(parseSvgPalette('{"RED":"#00FF00","#fff":"#ffffff","x":"#000"}')) === '{"#ff0000":"#00ff00"}',
    "Palette parsing normalizes colors and drops no-ops and invalid entries"
  )
  assert(parseSvgPalette("not json") && Object.keys(parseSvgPalette("[1]")).length === 0, "Invalid palettes are empty")
  assert(Math.abs(readSvgAspect(`<svg viewBox="0 0 100 60">`) - 100 / 60) < 1e-9, "Aspect from viewBox")
  assert(readSvgAspect(`<svg width="80" height="40">`) === 2, "Aspect from width and height")
  const shape = createLayer("shape")
  assert(shape.params.svgColorMode === "original" && shape.params.svgPalette === "", "New shapes default to original SVG colors")
  return 8
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const backdrop = [0, 0, 0, 0]
  const input = new THREE.DataTexture(new Float32Array(backdrop), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", ShapePass],
      ["runtime", RuntimeShapePass],
    ]) {
      const pass = new Pass(`svg-shape-${name}`)
      pass.updateCompositionRole("source")
      pass.flushColorNode()
      pass.resize(N, N)
      pass.updateLogicalSize(N, N)
      const render = async (params, svg = TWO_TONE) => {
        pass.updateParams({ ...createLayer("shape").params, shape: "svg", size: [0.6, 0.6], ...params })
        await pass.setSvg(svg)
        pass.render(renderer, input, target, 0, 0)
        const pixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
        return (x, y) => {
          const i = (index(y) * N + index(x)) * 4
          return pixels.slice(i, i + 4)
        }
      }
      const check = (label, actual, expected, tolerance = 0.02) => {
        close(actual, expected, `${name}: ${label}`, tolerance)
        results[label] ??= {}
        results[label][name] = actual
        samples++
      }

      let at = await render({})
      check("original left color", at(-0.15, 0), [1, 0, 0, 1])
      check("original right color from a style fill", at(0.15, 0), [0, 0, 1, 1])
      check("outside the SVG is empty", at(0.4, 0), backdrop)
      check("corner of the box is filled", at(-0.28, -0.28), [1, 0, 0, 1])

      at = await render({ svgColorMode: "single", color: "#00ff00" })
      check("single color fills every part", at(0.15, 0), [0, 1, 0, 1])

      at = await render({ svgPalette: '{"#ff0000":"#ffffff"}' })
      check("palette recolors one file color", at(-0.15, 0), [1, 1, 1, 1])
      check("palette leaves other colors", at(0.15, 0), [0, 0, 1, 1])

      at = await render({ outline: 0.04, color: "#00ff00" })
      check("outline empties the interior", at(0, 0), backdrop)
      check("outline draws in the layer color", at(-0.3, 0), [0, 1, 0, 1], 0.05)

      const alphaRow = (sampler) => Array.from({ length: 24 }, (_, i) => sampler(0.18 + i * 0.01, 0.1)[3])
      at = await render({ softness: 0.05 })
      const soft = at(0.3, 0)[3]
      assert(soft > 0.3 && soft < 0.7, `${name}: softness feathers the SVG edge (${soft})`)
      check("soft edge keeps the file color instead of black", at(0.31, 0).slice(0, 3).map((v) => (v > 0 ? 1 : 0)), [0, 0, 1])
      const svgSoft = alphaRow(at)
      pass.updateParams({ ...createLayer("shape").params, shape: "rectangle", cornerRadius: 0, size: [0.6, 0.6], softness: 0.05 })
      pass.render(renderer, input, target, 0, 0)
      const rectPixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
      const rectSoft = Array.from({ length: 24 }, (_, i) => {
        const j = (index(0.1) * N + index(0.18 + i * 0.01)) * 4
        return rectPixels[j + 3]
      })
      close(svgSoft, rectSoft, `${name}: SVG distance matches the procedural rectangle's softness`, 0.04)
      samples++

      at = await render({ size: [0.8, 0.4] }, WIDE)
      check("a width/height-only SVG fills its box", at(0.35, 0.15), [0, 0, 0, 1])
      check("outside the wide box", at(0, 0.25), backdrop)

      await pass.setSvg(null)
      pass.render(renderer, input, target, 0, 0)
      const cleared = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
      assert(cleared.every((v) => v === 0), `${name}: no SVG draws nothing`)
      samples++

      await pass.setSvg("data:image/svg+xml,not-an-svg").then(
        () => {
          throw new Error(`${name}: a missing SVG must reject`)
        },
        () => undefined
      )
      samples++
      pass.dispose()
    }
    for (const [label, entry] of Object.entries(results))
      close(entry.editor, entry.runtime, `parity: ${label}`, 0.002)
    samples += Object.keys(results).length
  } finally {
    target.dispose()
    input.dispose()
    renderer.dispose()
  }
  return samples
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
  const size = config.composition
  const headless = createHeadlessRenderer({ renderer, size })
  const target = new THREE.RenderTarget(size.width, size.height, { type: THREE.FloatType, depthBuffer: false })
  const material = new THREE.MeshBasicNodeMaterial({ blending: THREE.NoBlending })
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  try {
    await headless.initialize()
    const frame = runtimeFrame(config, 0, 0, 1, size)
    let previous = null
    for (let attempt = 0; attempt < 40; attempt++) {
      headless.render(frame)
      while (compiling.length) await Promise.all(compiling.splice(0))
      await new Promise((resolve) => setTimeout(resolve, 100))
      material.colorNode = texture(headless.render(frame), vec2(uv().x, float(1).sub(uv().y)))
      material.needsUpdate = true
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      const pixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, size.width, size.height))
      if (previous && attempt > 4 && pixels.every((value, i) => value === previous[i])) return pixels
      previous = pixels
    }
    return previous
  } finally {
    headless.dispose()
    target.dispose()
    renderer.dispose()
  }
}

export async function checkSvgShapes(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const logo = { id: "logo", kind: "image", url: TWO_TONE, fileName: "two-tone.svg", width: 100, height: 100 }
  const photo = { id: "photo", kind: "image", url: "/scenes/default/rings-photo.webp", fileName: "slice.webp", width: 1512, height: 908 }
  const shape = {
    ...createLayer("shape"),
    id: "svg-shape",
    assetId: logo.id,
    blendMode: "multiply",
    params: {
      ...createLayer("shape").params,
      shape: "svg",
      size: [0.7, 0.7],
      rotation: 15,
      svgPalette: '{"#0000ff":"#ffcc00"}',
    },
  }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [logo, photo],
    layers: [shape, { ...createLayer("image"), id: "photo-layer", assetId: photo.id }],
    selectedLayerId: shape.id,
    composition: { width: N, height: N },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const store = () => useLayerStore.getState()
  const before = buildEditorHistorySnapshot()
  store().updateLayerParam(shape.id, "svgPalette", "")
  store().updateLayerParam(shape.id, "svgColorMode", "single")
  applyEditorHistorySnapshot(before)
  assert(
    store().getLayerById(shape.id).params.svgPalette === '{"#0000ff":"#ffcc00"}' &&
      store().getLayerById(shape.id).params.svgColorMode === "original",
    "History lost SVG colors"
  )
  const duplicateId = store().duplicateLayer(shape.id)
  assert(store().getLayerById(duplicateId).assetId === logo.id, "Duplicates keep the SVG")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  assert(saved.assets.some((asset) => asset.id === logo.id), "Saved files keep the SVG asset")
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedShape = reopened.layers.find((l) => l.id === shape.id)
  assert(
    reopenedShape.assetId === logo.id && reopenedShape.params.svgPalette === '{"#0000ff":"#ffcc00"}',
    "Save/reopen changed the SVG shape"
  )
  const missing = {
    ...JSON.parse(JSON.stringify(saved)),
    assets: saved.assets.map((asset) => (asset.id === logo.id ? { id: asset.id, kind: "image", fileName: "two-tone.svg" } : asset)),
  }
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(missing), [])
  assert(store().getLayerById(shape.id).runtimeError === "Missing asset: two-tone.svg", "A missing SVG is reported")
  samples += 6

  const config = buildShaderExportConfig(reopened)
  const exported = config.layers.find((l) => l.id === shape.id)
  assert(
    exported.asset?.kind === "image" && exported.asset.src === "/replace/image/two-tone.svg",
    `Shader export includes the SVG, got ${JSON.stringify(exported.asset)}`
  )
  samples++

  const first = await renderProject(saved)
  const at = (image, x, y) => {
    const i = (index(y) * N + index(x)) * 4
    return Array.from(image.data.slice(i, i + 4))
  }
  const outside = await renderProject({ ...saved, layers: saved.layers.map((l) => (l.id === shape.id ? { ...l, visible: false } : l)) })
  close(at(first.image, 0.45, 0.45), at(outside.image, 0.45, 0.45), "Outside the SVG the photo is untouched", 1)
  const inside = at(first.image, -0.1, 0)
  const photoInside = at(outside.image, -0.1, 0)
  assert(inside[1] < photoInside[1] - 10 && inside[2] < photoInside[2] - 10, `Multiply with red darkens green and blue, got ${inside} over ${photoInside}`)
  const restored = await renderProject(reopened)
  close(Array.from(restored.image.data), Array.from(first.image.data), "Reopened pixels", 0)
  const runtimePixels = await runtimeRender({
    ...config,
    layers: config.layers.map((layer) => {
      if (layer.id === shape.id) return { ...layer, asset: { ...layer.asset, src: TWO_TONE } }
      if (layer.asset) return { ...layer, asset: { ...layer.asset, src: photo.url } }
      return layer
    }),
  })
  close(
    runtimePixels,
    Array.from(first.image.data, (value, i) => {
      const v = value / 255
      return i % 4 === 3 ? v : linear(v)
    }),
    "Exported runtime SVG shape parity",
    0.02
  )
  samples += 4
  return { samples, png: first.png }
}
