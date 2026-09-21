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
      await render({})
      const sceneDepth = pass.getOutputSceneDepth()
      assert(sceneDepth && sceneDepth !== input, `${name}: depth-bearing image exposes a scene depth texture`)
      const probeMaterial = new THREE.MeshBasicNodeMaterial({ blending: THREE.NoBlending })
      probeMaterial.colorNode = texture(sceneDepth, vec2(uv().x, float(1).sub(uv().y)))
      const probeScene = new THREE.Scene()
      probeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), probeMaterial))
      renderer.setRenderTarget(target)
      renderer.render(probeScene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
      const sceneDepthPixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
      probeMaterial.dispose()
      const sceneCircle = at(sceneDepthPixels, CIRCLE.x, CIRCLE.y)
      expectNear(sceneCircle[0], CIRCLE.depth, 0.02, `${name}: scene depth red channel at the circle`)
      expectNear(sceneCircle[1], CIRCLE.depth, 0.02, `${name}: scene depth is gray`)
      expectNear(sceneCircle[3], 1, 0.01, `${name}: scene depth alpha marks in-bounds pixels`)
      expectNear(at(sceneDepthPixels, 0.5, 0.1)[0], 0, 0.02, `${name}: scene depth background`)
      expectNear(at(sceneDepthPixels, 0.72, 0.5)[0], SQUARE.depth, 0.02, `${name}: scene depth square`)

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
      assert(pass.getOutputSceneDepth() === null, `${name}: without depth the image passes no scene depth`)
      pass.dispose()
      samples += 36
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

const RAMP = JSON.stringify([
  { position: 0, color: "#000000" },
  { position: 1, color: "#ffffff" },
])

function srgbPixels(canvas) {
  const copy = document.createElement("canvas")
  copy.width = N
  copy.height = N
  const context = copy.getContext("2d", { willReadFrequently: true })
  context.drawImage(canvas, 0, 0)
  const data = context.getImageData(0, 0, N, N).data
  return (x, y) => {
    const i = (Math.round((1 - y) * (N - 1)) * N + Math.round(x * (N - 1))) * 4
    return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, data[i + 3] / 255]
  }
}

async function sceneDepthChecks(colorAsset, depthAsset) {
  const image = { ...createLayer("image"), id: "photo", assetId: colorAsset.id, depthAssetId: depthAsset.id }
  image.params = { ...image.params, parallaxMotion: "off" }
  const mapLayer = (extra, id = "map") => {
    const layer = { ...createLayer("gradient-map"), id }
    layer.params = { ...layer.params, stops: RAMP, ...extra }
    return layer
  }
  const timeline = { currentTime: 0, duration: 1, isPlaying: false, loop: true, selectedKeyframeId: null, selectedKeyframeIds: [], selectedTrackId: null, tracks: [] }
  const size = { width: N, height: N }
  const canvas = document.createElement("canvas")
  const editor = await createWebGPURenderer(canvas, { strictPassFailures: true })
  const renderLayers = async (layers, tracks = [], time = 0) => {
    const frame = buildRendererFrame({
      assets: [colorAsset, depthAsset],
      layers,
      sceneConfig: DEFAULT_SCENE_CONFIG,
      timeline: { ...timeline, currentTime: time, tracks },
      clockTime: time,
      outputSize: size,
      viewportSize: size,
      delta: 0,
      pixelRatio: 1,
    })
    editor.render(frame)
    const deadline = performance.now() + 30_000
    while (editor.hasPendingResources()) {
      if (performance.now() > deadline) throw new Error("Timed out loading media for scene depth checks")
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    editor.render(frame)
    await editor.waitForGpuIdle()
    return srgbPixels(canvas)
  }
  let samples = 0
  try {
    await editor.initialize()
    editor.resize(size, 1)
    const byLuma = await renderLayers([mapLayer({ input: "luminance" }), image])
    const byDepth = await renderLayers([mapLayer({ input: "depth" }), image])
    const circleLuma = byLuma(CIRCLE.x, CIRCLE.y)[0]
    const circleDepth = byDepth(CIRCLE.x, CIRCLE.y)[0]
    assert(circleDepth > 0.9, `Depth input maps the near circle to the top of the ramp (${circleDepth})`)
    assert(circleDepth > circleLuma + 0.15, `Depth input differs from luminance input (${circleDepth} vs ${circleLuma})`)
    assert(byDepth(0.5, 0.1)[0] < 0.08, `Depth input maps the background to the bottom of the ramp (${byDepth(0.5, 0.1)})`)
    const square = byDepth(0.72, 0.5)[0]
    assert(square > 0.45 && square < 0.65, `Depth input maps the far square to a mid tone (${square})`)
    assert(Math.abs(byDepth(0.72, 0.5)[2] - square) < 0.03, "Depth input output is gray")
    samples += 5

    const withoutDepth = await renderLayers([mapLayer({ input: "depth" }), { ...image, depthAssetId: null }])
    expectNear(withoutDepth(CIRCLE.x, CIRCLE.y)[0], circleLuma, 0.03, "Depth input falls back to luminance without a depth map")
    samples++

    const masked = await renderLayers([
      { ...mapLayer({ input: "luminance" }), mask: { shape: "depth", scope: "effect", enabled: true, invert: false, center: [0, 0], size: [0.5, 1], rotation: 0, feather: 0.02, paint: "" } },
      image,
    ])
    const maskedCircle = masked(CIRCLE.x, CIRCLE.y)
    const maskedBackground = masked(0.5, 0.1)
    const maskedSquare = masked(0.72, 0.5)
    assert(Math.abs(maskedCircle[0] - maskedCircle[2]) < 0.05 && maskedCircle[0] > 0.4, `Depth mask lets the effect reach the near circle (${maskedCircle})`)
    assert(maskedBackground[2] > maskedBackground[0] + 0.1, `Depth mask leaves the far background untouched (${maskedBackground})`)
    expectNear(maskedSquare[0], 128 / 255, 0.05, `Depth mask leaves the mid-depth square untouched (${maskedSquare})`)
    const inverted = await renderLayers([
      { ...mapLayer({ input: "luminance" }), mask: { shape: "depth", scope: "effect", enabled: true, invert: true, center: [0, 0], size: [0.5, 1], rotation: 0, feather: 0.02, paint: "" } },
      image,
    ])
    assert(inverted(0.5, 0.1)[0] > 0.08 && Math.abs(inverted(0.5, 0.1)[0] - inverted(0.5, 0.1)[2]) < 0.05, `Inverted depth mask maps the background to gray (${inverted(0.5, 0.1)})`)
    assert(inverted(CIRCLE.x, CIRCLE.y)[0] > 0.9 && inverted(CIRCLE.x, CIRCLE.y)[1] < 0.2, "Inverted depth mask spares the circle")
    samples += 5

    const group = { ...createLayer("group"), id: "group" }
    const insideGroup = await renderLayers([group, { ...mapLayer({ input: "depth" }, "inner"), parentId: "group" }, { ...image, parentId: "group" }])
    expectNear(insideGroup(CIRCLE.x, CIRCLE.y)[0], circleDepth, 0.03, `Scene depth flows inside a group that holds the image (${insideGroup(CIRCLE.x, CIRCLE.y)})`)
    const aboveGroup = await renderLayers([mapLayer({ input: "depth" }), group, { ...image, parentId: "group" }])
    expectNear(aboveGroup(CIRCLE.x, CIRCLE.y)[0], circleDepth, 0.03, `Scene depth leaves a group for effects above it (${aboveGroup(CIRCLE.x, CIRCLE.y)})`)
    samples += 2

    const maskedLayer = { ...mapLayer({ input: "luminance" }), mask: { shape: "depth", scope: "effect", enabled: true, invert: false, center: [0, 0], size: [0.5, 1], rotation: 0, feather: 0.02, paint: "" } }
    const sweep = [
      {
        binding: { key: "mask.near", kind: "param", label: "Mask Near", valueType: "number" },
        enabled: true,
        id: "sweep-near",
        keyframes: [
          { id: "n0", time: 0, value: 0.5 },
          { id: "n1", time: 1, value: 0 },
        ],
        layerId: "map",
      },
      {
        binding: { key: "mask.far", kind: "param", label: "Mask Far", valueType: "number" },
        enabled: true,
        id: "sweep-far",
        keyframes: [
          { id: "f0", time: 0, value: 1 },
          { id: "f1", time: 1, value: 0.2 },
        ],
        layerId: "map",
      },
    ]
    const sweepStart = await renderLayers([maskedLayer, image], sweep, 0)
    const sweepEnd = await renderLayers([maskedLayer, image], sweep, 1)
    assert(Math.abs(sweepStart(CIRCLE.x, CIRCLE.y)[0] - sweepStart(CIRCLE.x, CIRCLE.y)[2]) < 0.05, `Keyframed mask range at t=0 maps the near circle (${sweepStart(CIRCLE.x, CIRCLE.y)})`)
    assert(sweepEnd(CIRCLE.x, CIRCLE.y)[0] > 0.9 && sweepEnd(CIRCLE.x, CIRCLE.y)[1] < 0.2, `Keyframed mask range at t=1 leaves the circle red (${sweepEnd(CIRCLE.x, CIRCLE.y)})`)
    assert(sweepEnd(0.5, 0.1)[2] - sweepEnd(0.5, 0.1)[0] < 0.15 && sweepStart(0.5, 0.1)[2] - sweepStart(0.5, 0.1)[0] > 0.15, `Keyframed mask range at t=1 reaches the far background (${sweepEnd(0.5, 0.1)} vs ${sweepStart(0.5, 0.1)})`)
    const sweepEarly = await renderLayers([maskedLayer, image], sweep, 0.1)
    assert(Math.abs(sweepEarly(CIRCLE.x, CIRCLE.y)[0] - sweepEarly(CIRCLE.x, CIRCLE.y)[2]) < 0.05, `Interpolated range at t=0.1 still covers the circle (${sweepEarly(CIRCLE.x, CIRCLE.y)})`)
    const sweepLate = await renderLayers([maskedLayer, image], sweep, 0.3)
    assert(sweepLate(CIRCLE.x, CIRCLE.y)[0] > 0.9 && sweepLate(CIRCLE.x, CIRCLE.y)[1] < 0.2, `Interpolated range at t=0.3 has passed the circle (${sweepLate(CIRCLE.x, CIRCLE.y)})`)
    samples += 4
  } finally {
    editor.dispose()
    await editor.destroyDevice()
  }

  const runtimeMasked = { ...mapLayer({ input: "depth" }), mask: { shape: "depth", scope: "effect", enabled: true, invert: false, center: [0, 0], size: [0.5, 1], rotation: 0, feather: 0.02, paint: "" } }
  useLayerStore.getState().replaceState([runtimeMasked, image], "map", null)
  useAssetStore.getState().replaceAssets([colorAsset, depthAsset])
  const config = buildShaderExportConfig({
    assets: useAssetStore.getState().assets,
    composition: size,
    layers: useLayerStore.getState().layers,
    timeline: {
      duration: 1,
      loop: true,
      tracks: [
        {
          binding: { key: "mask.near", kind: "param", label: "Mask Near", valueType: "number" },
          enabled: true,
          id: "sweep-near",
          keyframes: [
            { id: "n0", time: 0, value: 0.5 },
            { id: "n1", time: 1, value: 0 },
          ],
          layerId: "map",
        },
        {
          binding: { key: "mask.far", kind: "param", label: "Mask Far", valueType: "number" },
          enabled: true,
          id: "sweep-far",
          keyframes: [
            { id: "f0", time: 0, value: 1 },
            { id: "f1", time: 1, value: 0.2 },
          ],
          layerId: "map",
        },
      ],
    },
  })
  const runtimeConfig = {
    ...config,
    layers: config.layers.map((entry) =>
      entry.type === "image"
        ? { ...entry, asset: { ...entry.asset, src: colorAsset.url }, depthAsset: { ...entry.depthAsset, src: depthAsset.url } }
        : entry
    ),
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
    const readAt = async (time) => {
      const frame = runtimeFrame(runtimeConfig, time, 0, 1, size)
      headless.render(frame)
      while (compiling.length) await Promise.all(compiling.splice(0))
      material.colorNode = texture(headless.render(frame), vec2(uv().x, float(1).sub(uv().y)))
      material.needsUpdate = true
      renderer.setRenderTarget(target)
      renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
      const pixels = Array.from(await renderer.readRenderTargetPixelsAsync(target, 0, 0, N, N))
      return (x, y) => {
        const i = (Math.round(y * N) * N + Math.round(x * N)) * 4
        return pixels.slice(i, i + 4)
      }
    }
    const deadline = performance.now() + 30_000
    let circle
    do {
      circle = (await readAt(0))(CIRCLE.x, CIRCLE.y)
      if (circle[0] > 0.85) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    } while (performance.now() < deadline)
    assert(circle[0] > 0.85 && Math.abs(circle[0] - circle[2]) < 0.05, `Runtime pipeline feeds scene depth to Gradient Map inside the mask range (${circle})`)
    const runtimeEnd = await readAt(1)
    const endCircle = runtimeEnd(CIRCLE.x, CIRCLE.y)
    assert(endCircle[0] > 0.9 && endCircle[1] < 0.2, `Runtime keyframed mask range leaves the circle red at t=1 (${endCircle})`)
    samples += 2
  } finally {
    headless.dispose()
    target.dispose()
    renderer.dispose()
  }
  return samples
}

async function timingChecks(colorUrl, depthUrl) {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  const input = new THREE.DataTexture(new Float32Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  input.needsUpdate = true
  const target = new THREE.RenderTarget(1920, 1080, { type: THREE.HalfFloatType, depthBuffer: false })
  const pass = new MediaPass("depth-timing")
  pass.updateCompositionRole("source")
  pass.flushColorNode()
  pass.resize(1920, 1080)
  pass.updateLogicalSize(1920, 1080)
  pass.updateOpacity(1)
  const defaults = createLayer("image").params
  const result = {}
  try {
    await pass.setMedia({ url: colorUrl, kind: "image", width: SOURCE, height: SOURCE })
    const time = async (label, params) => {
      pass.updateParams({ ...defaults, ...params })
      const times = []
      for (let frame = 0; frame < 6; frame++) {
        const start = performance.now()
        pass.render(renderer, input, target, frame / 30, 1 / 30)
        await renderer.backend.device.queue.onSubmittedWorkDone()
        if (frame > 0) times.push(performance.now() - start)
      }
      times.sort((a, b) => a - b)
      result[label] = Number(times[2].toFixed(1))
    }
    await time("plain", { parallaxMotion: "off" })
    await pass.setDepthMedia({ url: depthUrl, width: SOURCE, height: SOURCE })
    await time("depthMedium", { parallaxMotion: "orbit", parallaxAmount: 1, depthQuality: "medium" })
    await time("depthHigh", { parallaxMotion: "orbit", parallaxAmount: 1, depthQuality: "high" })
    await time("depthLow", { parallaxMotion: "orbit", parallaxAmount: 1, depthQuality: "low" })
    return result
  } finally {
    pass.dispose()
    target.dispose()
    input.dispose()
    renderer.dispose()
    renderer.backend.device.destroy()
  }
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
  samples += await sceneDepthChecks(model.colorAsset, model.depthAsset)
  const timing = await timingChecks(colorUrl, depthUrl)
  useLayerStore.getState().replaceState([])
  useAssetStore.getState().replaceAssets([])
  return { samples, png: toPng(passes.png), timing }
}
