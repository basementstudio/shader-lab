import { GrainPass as RuntimeGrain } from "@runtime/renderer/grain-pass"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { GrainPass } from "@/renderer/grain-pass"
import {
  DEFAULT_GRAIN_STYLE,
  GRAIN_STYLES,
  grainStyleParams,
  matchGrainStyle,
} from "@/lib/editor/config/grain-styles"
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
const encode = (v) => Math.max(0, v) ** (1 / 2.2)
const N = 64

const NEUTRAL = {
  amount: 0,
  size: 1.2,
  roughness: 0.4,
  clumping: 0.2,
  chroma: 0,
  response: 0.5,
  blend: "soft-light",
  speed: 0,
  seed: 0,
}
const ON = { ...NEUTRAL, amount: 0.8 }

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}
function std(values) {
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}
function correlation(a, b) {
  const ma = mean(a)
  const mb = mean(b)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return num / Math.sqrt(da * db)
}
function channel(pixels, c) {
  const out = []
  for (let i = c; i < pixels.length; i += 4) out.push(encode(pixels[i]))
  return out
}
function neighbourCorrelation(values, width) {
  const a = []
  const b = []
  for (let i = 0; i < values.length; i++)
    if ((i + 1) % width !== 0) {
      a.push(values[i])
      b.push(values[i + 1])
    }
  return correlation(a, b)
}

function unitChecks() {
  const entry = getLayerCatalogEntry("grain")
  assert(entry.label === "Grain" && entry.category === "core", "Catalog entry")
  const layer = createLayer("grain")
  assert(layer.kind === "effect" && layer.name === "Grain", "Grain is an effect layer")
  assert(
    matchGrainStyle(layer.params) === DEFAULT_GRAIN_STYLE.id,
    "New layers start on the Fine 35mm style"
  )
  assert(layer.params.speed === 1 && layer.params.seed === 0, "New grain moves at film rate")
  for (const style of GRAIN_STYLES)
    assert(
      matchGrainStyle({ ...layer.params, ...grainStyleParams(style) }) === style.id,
      `${style.id}: applying a style must select it`
    )
  assert(matchGrainStyle({ ...layer.params, size: 3.3 }) === "custom", "Editing shows Custom")
  assert(
    matchGrainStyle({ ...layer.params, speed: 0, seed: 12 }) === DEFAULT_GRAIN_STYLE.id,
    "Speed and seed are not part of a style"
  )
  return 5 + GRAIN_STYLES.length
}

function makeInput(fn, size = N) {
  const data = new Float32Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const value = fn(x / (size - 1), y / (size - 1))
      data.set(value.length === 4 ? value : [...value, 1], (y * size + x) * 4)
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType)
  tex.needsUpdate = true
  return tex
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const mid = linear(0.5)
  const inputs = {
    gray: makeInput(() => [mid, mid, mid]),
    ramp: makeInput((x) => [linear(x), linear(x), linear(x)]),
    rich: makeInput((x, y) => [x, (x * 3 + y * 5) % 1, y]),
    extremes: makeInput((x) => (x < 0.5 ? [0, 0, 0] : [1, 1, 1])),
    alpha: makeInput((x, y) => [mid, mid, mid, (x + y) / 2]),
  }
  const target = new THREE.RenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false })
  const large = new THREE.RenderTarget(N * 2, N * 2, { type: THREE.FloatType, depthBuffer: false })
  const results = {}
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", GrainPass],
      ["runtime", RuntimeGrain],
    ]) {
      const pass = new Pass(`grain-${name}`)
      pass.updateCompositionRole("effect")
      pass.flushColorNode()
      const render = async (input, params, time = 0, output = target, logical = N) => {
        pass.resize(output.width, output.height)
        pass.updateLogicalSize(logical, logical)
        pass.updateParams(params)
        pass.render(renderer, inputs[input], output, time, 0)
        return Array.from(
          await renderer.readRenderTargetPixelsAsync(output, 0, 0, output.width, output.height)
        )
      }
      const record = (label, pixels) => {
        results[label] ??= {}
        results[label][name] = pixels
        samples++
      }
      const source = (input) => Array.from(inputs[input].image.data)

      let px = await render("rich", NEUTRAL)
      close(px, source("rich"), `${name}: amount 0 is the identity`, 0.0005)
      record("identity", px)

      px = await render("gray", ON)
      const gray = channel(px, 0)
      const grayStd = std(gray)
      assert(grayStd > 0.03, `${name}: grain must be visible on mid gray (${grayStd})`)
      assert(Math.abs(mean(gray) - 0.5) < 0.01, `${name}: grain keeps the average tone (${mean(gray)})`)
      close(channel(px, 1), gray, `${name}: chroma 0 grain is monochrome`, 0.0005)
      record("mono", px)

      const colored = await render("gray", { ...ON, chroma: 1 })
      const r = channel(colored, 0)
      const g = channel(colored, 1)
      const b = channel(colored, 2)
      const spread = mean(r.map((v, i) => Math.abs(v - b[i])))
      assert(spread > 0.02, `${name}: chroma separates the channels (${spread})`)
      const unclipped = r.map((_, i) => i).filter((i) => Math.min(r[i], g[i], b[i]) > 0.001)
      assert(unclipped.length > N * N * 0.95, `${name}: chroma rarely clips (${unclipped.length})`)
      close(
        unclipped.map((i) => r[i] * 0.2126 + g[i] * 0.7152 + b[i] * 0.0722),
        unclipped.map((i) => gray[i]),
        `${name}: color grain leaves brightness unchanged`,
        0.001
      )
      record("chroma", colored)

      px = await render("extremes", ON)
      close(px, source("extremes"), `${name}: soft light keeps pure black and white clean`, 0.0005)
      const added = await render("extremes", { ...ON, blend: "add" })
      const blackStd = std(channel(added, 0).filter((_, i) => i % N < N / 2 - 1))
      assert(blackStd > 0.01, `${name}: add puts grain into black (${blackStd})`)
      record("add", added)
      const reference = await render("ramp", NEUTRAL)
      const band = (pixels, from, to) => {
        const residual = []
        for (let y = 0; y < N; y++)
          for (let x = Math.round(from * N); x < Math.round(to * N); x++) {
            const i = (y * N + x) * 4
            residual.push(encode(pixels[i]) - encode(reference[i]))
          }
        return std(residual)
      }
      const overlaid = await render("ramp", { ...ON, blend: "overlay" })
      const soft = await render("ramp", ON)
      assert(
        band(overlaid, 0.4, 0.6) > band(soft, 0.4, 0.6) * 1.6,
        `${name}: overlay is punchier than soft light in the midtones`
      )
      record("overlay", overlaid)

      const flat = { ...ON, blend: "add" }
      const midtone = await render("ramp", { ...flat, response: 0.5 })
      assert(
        band(midtone, 0.4, 0.6) > band(midtone, 0.02, 0.15) * 1.5 &&
          band(midtone, 0.4, 0.6) > band(midtone, 0.85, 0.98) * 1.5,
        `${name}: response 0.5 puts the grain in the midtones`
      )
      const shadows = await render("ramp", { ...flat, response: 0 })
      assert(
        band(shadows, 0.02, 0.15) > band(shadows, 0.85, 0.98) * 2,
        `${name}: response 0 moves the grain into the shadows`
      )
      const highlights = await render("ramp", { ...flat, response: 1 })
      assert(
        band(highlights, 0.85, 0.98) > band(highlights, 0.02, 0.15) * 2,
        `${name}: response 1 moves the grain into the highlights`
      )
      record("response", shadows)

      const small = neighbourCorrelation(channel(await render("gray", { ...ON, size: 0.7 }), 0), N)
      const big = neighbourCorrelation(channel(await render("gray", { ...ON, size: 4 }), 0), N)
      assert(big > small + 0.3, `${name}: larger size makes larger grain (${small} -> ${big})`)
      const soft0 = neighbourCorrelation(channel(await render("gray", { ...ON, size: 2, roughness: 0 }), 0), N)
      const rough1 = neighbourCorrelation(channel(await render("gray", { ...ON, size: 2, roughness: 1 }), 0), N)
      assert(soft0 > rough1 + 0.05, `${name}: roughness adds finer specks (${soft0} -> ${rough1})`)
      samples += 2

      const low = channel(await render("gray", { ...ON, size: 4 }), 0)
      const high = channel(await render("gray", { ...ON, size: 4 }, 0, large, N), 0)
      const downsampled = low.map((_, i) => {
        const x = i % N
        const y = Math.floor(i / N)
        const at = (dx, dy) => high[(y * 2 + dy) * N * 2 + x * 2 + dx]
        return (at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) / 4
      })
      const sameDocument = correlation(low, downsampled)
      assert(sameDocument > 0.85, `${name}: size is in document pixels at any resolution (${sameDocument})`)
      const otherDocument = correlation(
        low,
        channel(await render("gray", { ...ON, size: 4 }, 0, large, N * 2), 0).filter(
          (_, i) => i % 2 === 0 && Math.floor(i / (N * 2)) % 2 === 0
        )
      )
      assert(otherDocument < 0.5, `${name}: resolution check can fail (${otherDocument})`)
      samples += 2

      const clumped = channel(await render("gray", { ...ON, clumping: 1 }), 0)
      assert(correlation(clumped, gray) < 0.99, `${name}: clumping reshapes the grain`)
      const seeded = channel(await render("gray", { ...ON, seed: 7 }), 0)
      assert(Math.abs(correlation(seeded, gray)) < 0.3, `${name}: seed picks another pattern`)
      samples += 2

      const still = { ...ON, speed: 0 }
      const a = await render("gray", still, 0)
      const b2 = await render("gray", still, 3.7)
      close(a, b2, `${name}: speed 0 holds one grain pattern`, 0)
      assert(!pass.needsContinuousRender(), `${name}: static grain needs no continuous render`)
      const moving = { ...ON, speed: 1 }
      const f0 = await render("gray", moving, 0)
      const f0b = await render("gray", moving, 0.03)
      close(f0, f0b, `${name}: grain holds for the length of a film frame`, 0)
      assert(pass.needsContinuousRender(), `${name}: speed requests continuous render`)
      const f1 = await render("gray", moving, 0.05)
      const frameCorrelation = correlation(channel(f0, 0), channel(f1, 0))
      assert(
        Math.abs(frameCorrelation) < 0.25,
        `${name}: the next frame is a new pattern, not a slide (${frameCorrelation})`
      )
      const again = await render("gray", moving, 12.34)
      close(again, await render("gray", moving, 12.34), `${name}: a time always gives the same grain`, 0)
      const half = await render("gray", { ...ON, speed: 0.5 }, 0.05)
      close(half, f0, `${name}: speed 0.5 steps at 12 frames a second`, 0)
      record("frame 0", f0)
      record("frame 1", f1)
      samples += 4

      px = await render("alpha", ON)
      const alphaSource = source("alpha")
      close(
        px.filter((_, i) => i % 4 === 3),
        alphaSource.filter((_, i) => i % 4 === 3),
        `${name}: grain keeps coverage`,
        0.0005
      )
      record("alpha", px)

      for (const style of GRAIN_STYLES) {
        px = await render("rich", { ...NEUTRAL, ...grainStyleParams(style) }, 0.5)
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
    large.dispose()
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

async function timing() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  const width = 1920
  const height = 1080
  const input = makeInput((x, y) => [x, y, 0.5])
  const target = new THREE.RenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false })
  const pass = new GrainPass("grain-timing")
  pass.updateCompositionRole("effect")
  pass.flushColorNode()
  pass.resize(width, height)
  pass.updateLogicalSize(width, height)
  const measure = async (params) => {
    pass.updateParams(params)
    pass.render(renderer, input, target, 0, 0)
    await renderer.readRenderTargetPixelsAsync(target, 0, 0, 1, 1)
    const runs = []
    for (let run = 0; run < 5; run++) {
      const start = performance.now()
      for (let frame = 0; frame < 30; frame++) pass.render(renderer, input, target, frame / 24, 0)
      await renderer.readRenderTargetPixelsAsync(target, 0, 0, 1, 1)
      runs.push((performance.now() - start) / 30)
    }
    return runs.sort((a, b) => a - b)[2]
  }
  try {
    const off = await measure({ ...NEUTRAL, amount: 0 })
    const result = { passthrough: off }
    for (const style of GRAIN_STYLES)
      result[style.id] = await measure({ ...NEUTRAL, ...grainStyleParams(style), speed: 1 })
    return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, Number(v.toFixed(3))]))
  } finally {
    pass.dispose()
    target.dispose()
    input.dispose()
    renderer.dispose()
  }
}

async function runtimeRender(config, time = 0) {
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
    const frame = runtimeFrame(config, time, 0, 1, config.composition)
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

export async function checkGrain(renderProject) {
  let samples = unitChecks()
  samples += await passChecks()

  const grain = { ...createLayer("grain"), id: "grain" }
  const project = {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [grain, stripes("field")],
    selectedLayerId: grain.id,
    composition: { width: N, height: N },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 1, loop: true, tracks: [] },
  }
  applyLabProjectFile(parseLabProjectFileValue(project), [])
  const store = () => useLayerStore.getState()
  const before = buildEditorHistorySnapshot()
  const pushed = GRAIN_STYLES.find((s) => s.id === "pushed")
  for (const [key, value] of Object.entries(grainStyleParams(pushed)))
    store().updateLayerParam(grain.id, key, value)
  assert(matchGrainStyle(store().getLayerById(grain.id).params) === "pushed", "Style edits reach the store")
  applyEditorHistorySnapshot(before)
  assert(
    matchGrainStyle(store().getLayerById(grain.id).params) === DEFAULT_GRAIN_STYLE.id,
    "History lost grain settings"
  )
  const duplicateId = store().duplicateLayer(grain.id)
  store().updateLayerParam(duplicateId, "size", 5)
  assert(store().getLayerById(grain.id).params.size === DEFAULT_GRAIN_STYLE.values.size, "Duplicate must be independent")
  applyEditorHistorySnapshot(before)
  const saved = buildLabProjectFile()
  store().replaceState([])
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  const reopened = buildLabProjectFile()
  const reopenedGrain = reopened.layers.find((l) => l.id === grain.id)
  assert(
    reopenedGrain.type === "grain" &&
      matchGrainStyle(reopenedGrain.params) === DEFAULT_GRAIN_STYLE.id &&
      reopenedGrain.params.speed === 1,
    "Save/reopen changed the grain"
  )
  const config = buildShaderExportConfig(reopened)
  assert(config.layers.find((l) => l.id === grain.id).type === "grain", "Shader export type")
  samples += 4

  for (const time of [0, 0.3]) {
    const first = await renderProject(saved, time)
    const restored = await renderProject(reopened, time)
    close(Array.from(restored.image.data), Array.from(first.image.data), `Reopened pixels at ${time}s`, 0)
    const runtimePixels = await runtimeRender(config, time)
    close(
      runtimePixels,
      Array.from(first.image.data, (value, i) => {
        const v = value / 255
        return i % 4 === 3 ? v : linear(v)
      }),
      `Exported runtime grain parity at ${time}s`,
      0.02
    )
    samples += 2
  }
  const moved = await renderProject(saved, 0.3)
  const held = await renderProject(saved, 0)
  assert(
    Array.from(moved.image.data).some((v, i) => v !== held.image.data[i]),
    "Grain animates in the renderer"
  )
  samples++

  const asset = {
    id: "photo-asset",
    kind: "image",
    url: "/scenes/default/editorial/flora.webp",
    fileName: "flora.webp",
    width: 1512,
    height: 908,
  }
  const photo = { ...createLayer("image"), id: "photo", assetId: asset.id }
  const photoProject = (params, composition = { width: 1512, height: 908 }) => ({
    ...saved,
    composition,
    assets: [asset],
    layers: [{ ...createLayer("grain"), id: "photo-grain", params: { ...createLayer("grain").params, ...params } }, photo],
    selectedLayerId: "photo-grain",
  })
  const styles = {}
  styles.none = (await renderProject(photoProject({ amount: 0 }))).png
  for (const style of GRAIN_STYLES) {
    styles[style.id] = (await renderProject(photoProject(grainStyleParams(style)))).png
    samples++
  }
  const frames = {}
  for (const [label, time] of [
    ["t0.00", 0],
    ["t0.03", 0.03],
    ["t0.05", 0.05],
  ])
    frames[label] = (await renderProject(photoProject(grainStyleParams(DEFAULT_GRAIN_STYLE)), time)).png
  const video = {
    id: "video-asset",
    kind: "video",
    url: "/scenes/default/aura.mp4",
    fileName: "aura.mp4",
    mimeType: "video/mp4",
    width: 578,
    height: 720,
    duration: 5.041667,
  }
  for (const [label, style, time] of [
    ["video-16mm-t1.00", "16mm", 1],
    ["video-16mm-t1.05", "16mm", 1.05],
    ["video-color-negative-t2.00", "color-negative", 2],
  ]) {
    const base = createLayer("grain")
    frames[label] = (
      await renderProject(
        {
          ...saved,
          composition: { width: 578, height: 720 },
          assets: [video],
          layers: [
            {
              ...base,
              id: "video-grain",
              params: { ...base.params, ...grainStyleParams(GRAIN_STYLES.find((s) => s.id === style)) },
            },
            { ...createLayer("video"), id: "video", assetId: video.id },
          ],
          selectedLayerId: "video-grain",
          timeline: { duration: 5.041667, loop: true, tracks: [] },
        },
        time
      )
    ).png
  }
  const studyColor = {
    id: "study-color",
    kind: "image",
    url: "/scenes/default/dof-study.png",
    fileName: "study.png",
    width: 540,
    height: 780,
  }
  const studyDepth = { ...studyColor, id: "study-depth", url: "/scenes/default/dof-study-depth.png", fileName: "study-depth.png" }
  const study = { ...createLayer("image"), id: "study", assetId: studyColor.id, depthAssetId: studyDepth.id }
  study.params = { ...study.params, parallaxMotion: "off", fitMode: "cover" }
  const blur = createLayer("focus-blur")
  frames["study-31-fine-35mm"] = (
    await renderProject({
      ...saved,
      composition: { width: 540, height: 780 },
      assets: [studyColor, studyDepth],
      layers: [
        { ...createLayer("grain"), id: "study-grain" },
        { ...blur, id: "dof", params: { ...blur.params, grain: 0 } },
        study,
      ],
      selectedLayerId: "study-grain",
    })
  ).png
  const catalog = await renderProject(
    photoProject(grainStyleParams(GRAIN_STYLES.find((s) => s.id === "16mm")), { width: 480, height: 600 })
  )
  return { samples, styles, frames, timing: await timing(), previewWebp: toWebp(catalog.image) }
}
