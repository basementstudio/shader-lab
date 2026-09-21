import {
  MediaPass as RuntimeMediaPass,
  parallaxCameraAt as runtimeParallaxCameraAt,
  resolveDepthSteps as runtimeResolveDepthSteps,
} from "@runtime/renderer/media-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import {
  MediaPass,
  parallaxCameraAt,
  resolveDepthSteps,
  resolveParallaxMotion,
} from "@/renderer/media-pass"
import { buildRendererFrame } from "@/renderer/contracts"
import { createWebGPURenderer } from "@/renderer/create-webgpu-renderer"
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
import { useAssetStore } from "@/store/asset-store"
import { useLayerStore } from "@/store/layer-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

function assert(value, label) {
  if (!value) throw new Error(label)
}
const N = 128
const SOURCE = 256
const CIRCLE = { x: 0.3, y: 0.5, r: 0.13, depth: 0.9 }
const SQUARE = { x0: 0.6, x1: 0.85, y0: 0.35, y1: 0.65, depth: 0.25 }
const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

function paintScene(depth) {
  const canvas = document.createElement("canvas")
  canvas.width = SOURCE
  canvas.height = SOURCE
  const context = canvas.getContext("2d")
  const gray = (value) => `rgb(${Math.round(value * 255)},${Math.round(value * 255)},${Math.round(value * 255)})`
  context.fillStyle = depth ? gray(0) : "rgb(26,26,77)"
  context.fillRect(0, 0, SOURCE, SOURCE)
  context.fillStyle = depth ? gray(SQUARE.depth) : "rgb(128,128,128)"
  context.fillRect(
    SQUARE.x0 * SOURCE,
    SQUARE.y0 * SOURCE,
    (SQUARE.x1 - SQUARE.x0) * SOURCE,
    (SQUARE.y1 - SQUARE.y0) * SOURCE
  )
  context.fillStyle = depth ? gray(CIRCLE.depth) : "rgb(255,0,0)"
  context.beginPath()
  context.arc(CIRCLE.x * SOURCE, CIRCLE.y * SOURCE, CIRCLE.r * SOURCE, 0, Math.PI * 2)
  context.fill()
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(URL.createObjectURL(blob)), "image/png")
  )
}

const isRed = (p) => p[0] > 0.5 && p[1] < 0.2 && p[2] < 0.2
const isGray = (p) => Math.abs(p[0] - p[1]) < 0.03 && p[0] > 0.12 && p[0] < 0.32
const isBackground = (p) => p[0] < 0.05 && p[2] > p[0] + 0.03

function analyze(pixels, size, alphaIndex = 3) {
  const stats = { red: { n: 0, x: 0, y: 0 }, gray: { n: 0, x: 0, y: 0 } }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const p = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + alphaIndex]]
      let bucket = null
      if (isRed(p)) bucket = stats.red
      else if (isGray(p)) bucket = stats.gray
      if (!bucket) continue
      bucket.n++
      bucket.x += x
      bucket.y += y
    }
  }
  for (const bucket of Object.values(stats)) {
    bucket.x = bucket.n ? bucket.x / bucket.n : Number.NaN
    bucket.y = bucket.n ? bucket.y / bucket.n : Number.NaN
  }
  return stats
}

function expectNear(actual, expected, tolerance, label) {
  assert(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: got ${actual}, expected ${expected} ±${tolerance}`
  )
}

function unitChecks() {
  for (const fn of [parallaxCameraAt, runtimeParallaxCameraAt]) {
    const rest = fn("orbit", 1, 1, [0, 0], 0)
    expectNear(rest.shiftX, 0.15, 1e-6, "orbit t=0 x")
    expectNear(rest.shiftY, 0, 1e-6, "orbit t=0 y")
    const quarter = fn("orbit", 1, 1, [0, 0], 1)
    expectNear(quarter.shiftX, 0, 1e-6, "orbit t=1 x")
    expectNear(quarter.shiftY, 0.15, 1e-6, "orbit t=1 y")
    expectNear(fn("dolly", 1, 1, [0, 0], 1).dolly, 0.3, 1e-6, "dolly t=1")
    expectNear(fn("sway", 0.5, 1, [0.4, -0.2], 1).shiftX, 0.1 + 0.075, 1e-6, "sway with offset")
    expectNear(fn("nod", 0.5, 1, [0.4, -0.2], 1).shiftY, -0.05 + 0.075, 1e-6, "nod with offset")
    expectNear(fn("off", 1, 1, [1, 0], 3).shiftX, 0.25, 1e-6, "off keeps offset only")
  }
  assert(
    resolveDepthSteps("low") === 16 &&
      resolveDepthSteps("medium") === 32 &&
      resolveDepthSteps("high") === 64 &&
      resolveDepthSteps(undefined) === 32 &&
      runtimeResolveDepthSteps("high") === 64,
    "Depth quality steps"
  )
  assert(
    resolveParallaxMotion("dolly") === "dolly" &&
      resolveParallaxMotion("nope") === "off" &&
      resolveParallaxMotion(undefined) === "off",
    "Parallax motion fallback"
  )
  return 3
}

function rowEdges(pixels, size, classify, y) {
  const row = Math.round(y * size)
  let left = Number.NaN
  let right = Number.NaN
  for (let x = 0; x < size; x++) {
    const i = (row * size + x) * 4
    if (classify(pixels.slice(i, i + 4))) {
      if (Number.isNaN(left)) left = x
      right = x
    }
  }
  return { left, right }
}

function columnEdges(pixels, size, classify, x) {
  const column = Math.round(x * size)
  let top = Number.NaN
  let bottom = Number.NaN
  for (let y = 0; y < size; y++) {
    const i = (y * size + column) * 4
    if (classify(pixels.slice(i, i + 4))) {
      if (Number.isNaN(top)) top = y
      bottom = y
    }
  }
  return { bottom, top }
}

const EDGE_TOL = 2.5
const CIRCLE_LEFT = (CIRCLE.x - CIRCLE.r) * N
const CIRCLE_RIGHT = (CIRCLE.x + CIRCLE.r) * N
const SQUARE_LEFT = SQUARE.x0 * N

async function passChecks(colorUrl, depthUrl) {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const input = new THREE.DataTexture(new Float32Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const defaults = createLayer("image").params
  const captured = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", MediaPass],
      ["runtime", RuntimeMediaPass],
    ]) {
      const pass = new Pass(`depth-${name}`)
      pass.updateCompositionRole("source")
      pass.flushColorNode()
      pass.resize(N, N)
      pass.updateLogicalSize(N, N)
      pass.updateOpacity(1)
      if (name === "editor") {
        await pass.setMedia({ url: colorUrl, kind: "image", width: SOURCE, height: SOURCE })
      } else {
        await pass.setMedia(colorUrl, "image")
      }
      const render = async (params, time = 0) => {
        pass.updateParams({ ...defaults, parallaxMotion: "off", ...params })
        pass.render(renderer, input, target, time, 1 / 60)
        return Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
      }
      const at = (pixels, x, y) => {
        const i = (Math.round(y * N) * N + Math.round(x * N)) * 4
        return pixels.slice(i, i + 4)
      }
      const redRow = (pixels) => rowEdges(pixels, N, isRed, CIRCLE.y)
      const grayRow = (pixels) => rowEdges(pixels, N, isGray, 0.5)
      const base = await render({})
      const baseStats = analyze(base, N)
      assert(baseStats.red.n > 500 && baseStats.gray.n > 500, `${name}: synthetic scene not visible`)
      expectNear(redRow(base).left, CIRCLE_LEFT, EDGE_TOL, `${name}: base circle left edge`)
      expectNear(redRow(base).right, CIRCLE_RIGHT, EDGE_TOL, `${name}: base circle right edge`)
      expectNear(grayRow(base).left, SQUARE_LEFT, EDGE_TOL, `${name}: base square left edge`)
      const baseColumn = columnEdges(base, N, isRed, CIRCLE.x)
      assert(!pass.needsContinuousRender(), `${name}: still image must not render continuously`)

      if (name === "editor") {
        await pass.setDepthMedia({ url: depthUrl, width: SOURCE, height: SOURCE })
      } else {
        await pass.setDepthMedia(depthUrl)
      }
      const still = await render({})
      let maxDelta = 0
      for (let i = 0; i < base.length; i++) maxDelta = Math.max(maxDelta, Math.abs(base[i] - still[i]))
      assert(maxDelta < 0.003, `${name}: zero camera must leave the image untouched (${maxDelta})`)
      assert(!pass.needsContinuousRender(), `${name}: depth with Motion Off is static`)

      const depthView = await render({ depthView: true })
      expectNear(at(depthView, CIRCLE.x, CIRCLE.y)[0], CIRCLE.depth, 0.02, `${name}: depth view circle`)
      expectNear(at(depthView, 0.5, 0.1)[0], 0, 0.02, `${name}: depth view background`)
      expectNear(at(depthView, 0.72, 0.5)[0], SQUARE.depth, 0.02, `${name}: depth view square`)
      expectNear(at(await render({ depthView: true, depthInvert: true }), CIRCLE.x, CIRCLE.y)[0], 1 - CIRCLE.depth, 0.02, `${name}: inverted depth view`)
      captured[`${name}:depthView`] = depthView

      const shift = 0.5 * 0.25
      const shifted = await render({ parallaxOffset: [0.5, 0], depthRange: 1, depthFocus: 0 })
      const shiftedRed = redRow(shifted)
      expectNear(shiftedRed.left, CIRCLE_LEFT - shift * CIRCLE.depth * N, EDGE_TOL, `${name}: near circle leading edge`)
      assert(
        shiftedRed.right >= CIRCLE_RIGHT - shift * CIRCLE.depth * N - EDGE_TOL && shiftedRed.right <= CIRCLE_RIGHT + EDGE_TOL,
        `${name}: trailing edge stays between the displaced and original silhouette (${shiftedRed.right})`
      )
      expectNear(grayRow(shifted).left, SQUARE_LEFT - shift * SQUARE.depth * N, EDGE_TOL, `${name}: far square leading edge`)
      const shiftedStats = analyze(shifted, N)
      assert(shiftedStats.red.n >= baseStats.red.n * 0.98 && shiftedStats.red.n <= baseStats.red.n * 1.4, `${name}: near object survives the march (${shiftedStats.red.n} vs ${baseStats.red.n})`)
      for (let x = 0.05; x < 0.95; x += 0.05) {
        const pixel = at(shifted, x, CIRCLE.y)
        assert(pixel.every(Number.isFinite) && (x > SQUARE.x0 - 0.1 || !isGray(pixel)), `${name}: no far content leaks into the near zone at x=${x.toFixed(2)} (${pixel})`)
      }
      assert(isRed(at(shifted, CIRCLE.x - shift * CIRCLE.depth, CIRCLE.y)), `${name}: displaced circle center is red`)
      captured[`${name}:shifted`] = shifted

      const inverted = await render({ parallaxOffset: [0.5, 0], depthRange: 1, depthFocus: 0, depthInvert: true })
      expectNear(redRow(inverted).right, CIRCLE_RIGHT - shift * N, EDGE_TOL, `${name}: inverted depth makes the background the near plane over the circle`)
      expectNear(grayRow(inverted).right, SQUARE.x1 * N - shift * N, EDGE_TOL, `${name}: inverted depth makes the background the near plane over the square`)

      const exposed = { parallaxOffset: [-1, 0], depthRange: 1, depthFocus: 1 }
      const transparent = await render({ ...exposed, depthEdges: "transparent" })
      const stretch = await render({ ...exposed, depthEdges: "stretch" })
      expectNear(at(transparent, 0.97, 0.5)[3], 0, 0.01, `${name}: transparent edge alpha`)
      expectNear(at(stretch, 0.97, 0.5)[3], 1, 0.01, `${name}: stretched edge alpha`)
      assert(isBackground(at(stretch, 0.97, 0.5)), `${name}: stretched edge repeats the border`)
      expectNear(at(transparent, 0.5, 0.5)[3], 1, 0.01, `${name}: interior stays opaque`)

      for (const depthQuality of ["low", "high"]) {
        const edges = redRow(await render({ parallaxOffset: [0.5, 0], depthRange: 1, depthFocus: 0, depthQuality }))
        expectNear(edges.left, shiftedRed.left, EDGE_TOL, `${name}: quality ${depthQuality} agrees`)
      }
      await render({})

      const orbit = { parallaxMotion: "orbit", parallaxAmount: 1, parallaxSpeed: 1, depthRange: 1, depthFocus: 0 }
      const orbitStart = await render(orbit, 0)
      assert(pass.needsContinuousRender(), `${name}: motion requests continuous rendering`)
      expectNear(redRow(orbitStart).left, CIRCLE_LEFT - 0.15 * CIRCLE.depth * N, EDGE_TOL, `${name}: orbit t=0 leading edge`)
      const startColumn = columnEdges(orbitStart, N, isRed, CIRCLE.x - 0.15 * CIRCLE.depth)
      expectNear(startColumn.top, baseColumn.top, EDGE_TOL, `${name}: orbit t=0 keeps the vertical extent`)
      expectNear(startColumn.bottom, baseColumn.bottom, EDGE_TOL, `${name}: orbit t=0 keeps the vertical extent`)
      const orbitQuarter = await render(orbit, 1)
      const quarterColumn = columnEdges(orbitQuarter, N, isRed, CIRCLE.x)
      const moved = [Math.abs(quarterColumn.top - baseColumn.top), Math.abs(quarterColumn.bottom - baseColumn.bottom)]
      const movedCenterRow =
        moved[0] > moved[1]
          ? quarterColumn.top + CIRCLE.r * N
          : quarterColumn.bottom - CIRCLE.r * N
      expectNear(rowEdges(orbitQuarter, N, isRed, movedCenterRow / N).left, CIRCLE_LEFT, EDGE_TOL, `${name}: orbit t=1 leading edge returns at the moved center row`)
      expectNear(Math.max(...moved), 0.15 * CIRCLE.depth * N, EDGE_TOL, `${name}: orbit t=1 moves the leading vertical edge`)
      assert(Math.min(...moved) <= Math.max(...moved) + EDGE_TOL, `${name}: orbit t=1 trailing edge smears no further than the leading edge (${moved})`)
      const dolly = redRow(await render({ ...orbit, parallaxMotion: "dolly" }, 1))
      assert(Math.abs(dolly.left - CIRCLE_LEFT) > 2, `${name}: dolly moves off-center content`)

      pass.clearDepthMedia()
      const detached = await render({ parallaxOffset: [0.5, 0], depthRange: 1, depthFocus: 0 })
      maxDelta = 0
      for (let i = 0; i < base.length; i++) maxDelta = Math.max(maxDelta, Math.abs(base[i] - detached[i]))
      assert(maxDelta < 0.003, `${name}: removing the depth map restores the plain image`)
      pass.dispose()
      samples += 30
    }
    for (const key of ["shifted", "depthView"]) {
      const editor = captured[`editor:${key}`]
      const runtime = captured[`runtime:${key}`]
      let differing = 0
      for (let i = 0; i < editor.length; i += 4) {
        for (let c = 0; c < 4; c++) {
          if (Math.abs(editor[i + c] - runtime[i + c]) > 0.02) {
            differing++
            break
          }
        }
      }
      assert(differing === 0, `Editor/runtime parity (${key}): ${differing} pixels differ`)
      samples++
    }
    return { samples, png: captured["editor:shifted"] }
  } finally {
    input.dispose()
    target.dispose()
    renderer.dispose()
    renderer.backend.device.destroy()
  }
}

function makeAsset(id, fileName, url) {
  return {
    createdAt: "2026-09-23T00:00:00.000Z",
    duration: null,
    error: null,
    fileName,
    id,
    kind: "image",
    mimeType: "image/png",
    sizeBytes: 1,
    source: "local",
    status: "ready",
    url,
    width: SOURCE,
    height: SOURCE,
  }
}

function modelChecks(colorUrl, depthUrl) {
  const store = () => useLayerStore.getState()
  const colorAsset = makeAsset("color-1", "scene.png", colorUrl)
  const depthAsset = makeAsset("depth-1", "scene-depth.png", depthUrl)
  const layer = { ...createLayer("image"), assetId: "color-1" }
  useAssetStore.getState().replaceAssets([colorAsset, depthAsset])
  store().replaceState([layer], layer.id, null)
  store().setLayerDepthAsset(layer.id, "depth-1")
  store().updateLayerParam(layer.id, "depthRange", 0.8)
  const saved = buildLabProjectFile()
  const savedLayer = saved.layers.find((entry) => entry.id === layer.id)
  assert(savedLayer.depthAssetId === "depth-1" && savedLayer.params.depthRange === 0.8, "Project file keeps the depth map reference")
  assert(saved.assets.some((asset) => asset.id === "depth-1"), "Depth map counts as a referenced asset")

  const before = buildEditorHistorySnapshot()
  store().setLayerDepthAsset(layer.id, null)
  assert(store().getLayerById(layer.id).depthAssetId === null, "Remove clears the depth map")
  applyEditorHistorySnapshot(before)
  assert(store().getLayerById(layer.id).depthAssetId === "depth-1", "History restores the depth map")
  const duplicateId = store().duplicateLayer(layer.id)
  assert(store().getLayerById(duplicateId).depthAssetId === "depth-1", "Duplicate keeps the depth map")

  const config = buildShaderExportConfig({
    assets: useAssetStore.getState().assets,
    composition: { width: N, height: N },
    layers: store().layers,
    timeline: { duration: 1, loop: true, tracks: [] },
  })
  const exported = config.layers.find((entry) => entry.id === layer.id)
  assert(exported.depthAsset?.kind === "image" && exported.depthAsset.src === "/replace/image/scene-depth.png", "Shader export emits the depth asset placeholder")
  assert(exported.asset.src === "/replace/image/scene.png", "Shader export keeps the color asset")

  store().replaceState([])
  const reopenedMissing = applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [colorAsset])
  assert(reopenedMissing.missingAssetCount === 0 || reopenedMissing.missingAssetCount === 1, "Missing depth reopen ran")
  const missingLayer = store().getLayerById(layer.id)
  assert(missingLayer.depthAssetId === null && /Missing depth map: scene-depth.png/.test(missingLayer.runtimeError ?? ""), `Missing depth map is reported, got ${missingLayer.runtimeError}`)

  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [colorAsset, depthAsset])
  const reopened = store().getLayerById(layer.id)
  assert(reopened.depthAssetId === "depth-1" && reopened.runtimeError === null && reopened.params.depthRange === 0.8, "Reopen with assets restores the depth map")
  const plain = parseLabProjectFileValue(JSON.parse(JSON.stringify({ ...saved, layers: saved.layers.map(({ depthAssetId, ...rest }) => rest) })))
  assert(plain.layers.every((entry) => entry.depthAssetId === undefined), "Older files without depthAssetId still parse")
  return { config, samples: 9, colorAsset, depthAsset }
}

async function pipelineChecks(config, colorAsset, depthAsset) {
  const layers = useLayerStore.getState().layers.filter((layer) => layer.assetId === "color-1").slice(0, 1)
  const layer = { ...layers[0], params: { ...layers[0].params, parallaxMotion: "off", parallaxOffset: [0.5, 0], depthRange: 1, depthFocus: 0 } }
  const expectedLeft = CIRCLE_LEFT - 0.125 * CIRCLE.depth * N
  const timeline = { currentTime: 0, duration: 1, isPlaying: false, loop: true, selectedKeyframeId: null, selectedKeyframeIds: [], selectedTrackId: null, tracks: [] }
  const canvas = document.createElement("canvas")
  const editor = await createWebGPURenderer(canvas, { strictPassFailures: true })
  const size = { width: N, height: N }
  const renderEditor = async (entry) => {
    const frame = buildRendererFrame({
      assets: [colorAsset, depthAsset],
      layers: [entry],
      sceneConfig: DEFAULT_SCENE_CONFIG,
      timeline,
      outputSize: size,
      viewportSize: size,
      delta: 0,
      clockTime: 0,
      pixelRatio: 1,
    })
    editor.render(frame)
    const deadline = performance.now() + 30_000
    while (editor.hasPendingResources()) {
      if (performance.now() > deadline) throw new Error("Timed out loading depth media in the editor pipeline")
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    editor.render(frame)
    await editor.waitForGpuIdle()
    const copy = document.createElement("canvas")
    copy.width = N
    copy.height = N
    const context = copy.getContext("2d", { willReadFrequently: true })
    context.drawImage(canvas, 0, 0)
    return Array.from(context.getImageData(0, 0, N, N).data, (v) => v / 255)
  }
  try {
    await editor.initialize()
    editor.resize(size, 1)
    const withDepth = rowEdges((await renderEditor(layer)).map(linearize8), N, isRed, CIRCLE.y)
    expectNear(withDepth.left, expectedLeft, 2, "Editor pipeline applies depth parallax")
    const withoutDepth = rowEdges((await renderEditor({ ...layer, depthAssetId: null })).map(linearize8), N, isRed, CIRCLE.y)
    expectNear(withoutDepth.left, CIRCLE_LEFT, 2, "Editor pipeline without depth map")
  } finally {
    editor.dispose()
    await editor.destroyDevice()
  }

  const runtimeConfig = {
    ...config,
    layers: config.layers
      .filter((entry) => entry.id === layer.id)
      .map((entry) => ({
        ...entry,
        asset: { ...entry.asset, src: colorAsset.url },
        depthAsset: { ...entry.depthAsset, src: depthAsset.url },
        params: { ...entry.params, parallaxMotion: "off", parallaxOffset: [0.5, 0], depthRange: 1, depthFocus: 0 },
      })),
  }
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  const compiling = []
  const compile = renderer.compileAsync.bind(renderer)
  renderer.compileAsync = (...args) => {
    const pending = compile(...args)
    compiling.push(pending)
    return pending
  }
  const headless = createHeadlessRenderer({ renderer, size })
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const material = new THREE.MeshBasicNodeMaterial({ blending: THREE.NoBlending })
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
  try {
    await headless.initialize()
    const frame = runtimeFrame(runtimeConfig, 0, 0, 1, size)
    const deadline = performance.now() + 30_000
    let edges
    do {
      headless.render(frame)
      while (compiling.length) await Promise.all(compiling.splice(0))
      material.colorNode = texture(headless.render(frame), vec2(uv().x, float(1).sub(uv().y)))
      material.needsUpdate = true
      renderer.setRenderTarget(target)
      renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
      edges = rowEdges(Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N)), N, isRed, CIRCLE.y)
      if (Math.abs(edges.left - expectedLeft) <= 2) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    } while (performance.now() < deadline)
    expectNear(edges.left, expectedLeft, 2, "Runtime pipeline applies depth parallax")
  } finally {
    headless.dispose()
    target.dispose()
    renderer.dispose()
  }
  return 3
}

const linearize8 = (v) => linear(v)

function toPng(pixels) {
  const canvas = document.createElement("canvas")
  canvas.width = N
  canvas.height = N
  const context = canvas.getContext("2d")
  const image = context.createImageData(N, N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const from = ((N - 1 - y) * N + x) * 4
      const to = (y * N + x) * 4
      for (let c = 0; c < 3; c++) {
        const v = pixels[from + c]
        image.data[to + c] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055))
      }
      image.data[to + 3] = Math.round(255 * pixels[from + 3])
    }
  }
  context.putImageData(image, 0, 0)
  return canvas.toDataURL("image/png")
}

export async function checkDepthParallax() {
  const colorUrl = await paintScene(false)
  const depthUrl = await paintScene(true)
  let samples = unitChecks()
  const passes = await passChecks(colorUrl, depthUrl)
  samples += passes.samples
  const model = modelChecks(colorUrl, depthUrl)
  samples += model.samples
  samples += await pipelineChecks(model.config, model.colorAsset, model.depthAsset)
  useLayerStore.getState().replaceState([])
  useAssetStore.getState().replaceAssets([])
  return { samples, png: toPng(passes.png) }
}
