import { GradientMapPass as RuntimeGradientMap } from "@runtime/renderer/gradient-map-pass"
import { interpolateGradientMapStops as runtimeInterpolate } from "@runtime/renderer/color-map-lut"
import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { resolveEvaluatedLayers } from "@runtime/timeline"
import { float, texture, uv, vec2 } from "three/tsl"
import * as THREE from "three/webgpu"
import { GradientMapPass } from "@/renderer/gradient-map-pass"
import {
  buildColorMapBytes,
  buildLinearColorMap,
  GRADIENT_MAP_PRESETS,
  interpolateGradientMapStops,
  parseGradientMapStops,
  serializeGradientMapStops,
} from "@/renderer/color-map-lut"
import { createParamTimelineBinding } from "@/components/editor/properties-sidebar-utils"
import { getLayerDefinition } from "@/lib/editor/config/layer-registry"
import { resolveEasing } from "@/lib/easing-curve"
import { duplicateLayers } from "@/lib/editor/duplicate-layers"
import {
  applyEditorHistorySnapshot,
  buildEditorHistorySnapshot,
} from "@/lib/editor/history"
import { createLayer } from "@/lib/editor/layers"
import {
  getParameterDefinition,
  isParameterAudioModulatable,
} from "@/lib/editor/parameter-schema"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildShaderExportConfig } from "@/lib/editor/shader-export"
import { evaluateTimelineForLayers } from "@/lib/editor/timeline/evaluate"
import { useLayerStore } from "@/store/layer-store"
import { createParamBinding, useTimelineStore } from "@/store/timeline-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

function assert(value, label) {
  if (!value) throw new Error(label)
}
const N = 64
const SMOOTH = { controlPoints: [0.65, 0, 0.35, 1], type: "bezier" }
const LINEAR = { controlPoints: [0, 0, 1, 1], type: "bezier" }
const preset = (id) =>
  serializeGradientMapStops(GRADIENT_MAP_PRESETS.find((p) => p.id === id).stops)
const THERMAL = preset("thermal")
const DUOTONE = preset("duotone")
const SEPIA = preset("sepia")
const NEON = preset("neon")
const GRAY = preset("grayscale")
const MOVED = serializeGradientMapStops([
  { position: 0, color: "#08083a" },
  { position: 0.6, color: "#1f5cff" },
  { position: 0.7, color: "#2fd27a" },
  { position: 0.8, color: "#f7e63b" },
  { position: 1, color: "#ff2e63" },
])
const CUSTOM = serializeGradientMapStops([
  { position: 1, color: "#fff4d6" },
  { position: 0.1, color: "#200010" },
  { position: 0.85, color: "#ff5500" },
  { position: 0.35, color: "#7700aa" },
])
const RAMPS = { THERMAL, DUOTONE, SEPIA, NEON, GRAY, MOVED, CUSTOM }
const lut = (stops) => buildColorMapBytes(parseGradientMapStops(stops))
const maxDelta = (a, b) => {
  let max = 0
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]))
  return max
}
const canonical = (value) =>
  JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry
  )

function interpolationChecks() {
  let samples = 0
  for (const [name, fn] of [
    ["editor", interpolateGradientMapStops],
    ["runtime", runtimeInterpolate],
  ]) {
    assert(fn(THERMAL, DUOTONE, 0) === THERMAL, `${name}: t=0 must return the first ramp`)
    assert(fn(THERMAL, DUOTONE, 1) === DUOTONE, `${name}: t=1 must return the second ramp`)
    assert(fn(SEPIA, SEPIA, 0.4) === SEPIA, `${name}: equal ramps must not change`)
    samples += 3
  }
  const glide = parseGradientMapStops(interpolateGradientMapStops(THERMAL, MOVED, 0.5))
  const thermal = parseGradientMapStops(THERMAL)
  const moved = parseGradientMapStops(MOVED)
  assert(glide.length === 5, "Same-count ramps keep their stop count")
  glide.forEach((stop, i) => {
    assert(
      Math.abs(stop.position - (thermal[i].position + moved[i].position) / 2) < 1e-4 &&
        stop.color === thermal[i].color,
      `Same-count stops must glide: stop ${i} ${JSON.stringify(stop)}`
    )
  })
  samples++
  for (const [fromName, from] of Object.entries(RAMPS)) {
    for (const [toName, to] of Object.entries(RAMPS)) {
      const label = `${fromName}->${toName}`
      const counts = [parseGradientMapStops(from).length, parseGradientMapStops(to).length]
      let previous = lut(from)
      let largest = 0
      for (let step = 1; step <= 100; step++) {
        const t = step / 100
        const value = interpolateGradientMapStops(from, to, t)
        assert(value === runtimeInterpolate(from, to, t), `${label}: editor/runtime differ at ${t}`)
        const stops = parseGradientMapStops(value)
        assert(
          step === 100 || stops.length === Math.max(...counts),
          `${label}: expected ${Math.max(...counts)} stops at ${t}, got ${stops.length}`
        )
        assert(
          value === from ||
          value === to ||
          stops.every(
            (stop, i) =>
              stop.position >= 0 &&
              stop.position <= 1 &&
              (i === 0 || stop.position >= stops[i - 1].position)
          ),
          `${label}: stops must stay ordered inside 0..1 at ${t}: ${value}`
        )
        const current = lut(value)
        largest = Math.max(largest, maxDelta(previous, current))
        previous = current
      }
      assert(largest <= 12, `${label}: a 1% step jumped ${largest}/255`)
      const nearStart = maxDelta(lut(interpolateGradientMapStops(from, to, 1e-4)), lut(from))
      const nearEnd = maxDelta(lut(interpolateGradientMapStops(from, to, 1 - 1e-4)), lut(to))
      assert(
        nearStart <= 1 && nearEnd <= 1,
        `${label}: aligned ramps must look like their keyframes (${nearStart}, ${nearEnd})`
      )
      samples += 3
    }
  }
  for (const [from, to] of [
    [THERMAL, DUOTONE],
    [NEON, THERMAL],
    [GRAY, SEPIA],
  ]) {
    const a = lut(from)
    const b = lut(to)
    for (const t of [0.25, 0.5, 0.8]) {
      const blended = a.map((v, i) => v + (b[i] - v) * t)
      const delta = maxDelta(lut(interpolateGradientMapStops(from, to, t)), blended)
      assert(delta <= 2, `Nested stops must crossfade the ramps (${delta} at ${t})`)
      samples++
    }
  }
  return samples
}

function bindingChecks() {
  const map = createLayer("gradient-map")
  const binding = createParamBinding(map, "stops")
  assert(
    binding &&
      binding.kind === "param" &&
      binding.key === "stops" &&
      binding.label === "Ramp" &&
      binding.valueType === "gradient",
    `Gradient Map ramp must be keyframeable: ${JSON.stringify(binding)}`
  )
  const definition = getParameterDefinition(getLayerDefinition("gradient-map").params, "stops")
  assert(
    canonical(createParamTimelineBinding(definition)) === canonical(binding),
    "Sidebar and timeline must agree on the ramp binding"
  )
  assert(!isParameterAudioModulatable(definition), "Ramps must not offer audio links")
  assert(
    createParamBinding(createLayer("lumen-print"), "stops") === null,
    "Other palettes stay unanimated"
  )
  return 4
}

function gradientField(id) {
  const layer = createLayer("gradient")
  const grays = ["#000000", "#3a3a3a", "#808080", "#c4c4c4", "#ffffff"]
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
      ...Object.fromEntries(grays.map((color, i) => [`point${i + 1}Color`, color])),
    },
  }
}

function rampTrack(layerId, keyframes, id = "ramp-track") {
  return {
    binding: { key: "stops", kind: "param", label: "Ramp", valueType: "gradient" },
    enabled: true,
    id,
    keyframes: keyframes.map(([time, value, easing = SMOOTH], i) => ({
      easing,
      id: `${id}-${i}`,
      time,
      value,
    })),
    layerId,
  }
}

function project(stops, tracks = []) {
  return {
    format: "shader-lab",
    version: 7,
    assets: [],
    layers: [
      { ...createLayer("gradient-map"), id: "map", params: { ...createLayer("gradient-map").params, stops } },
      gradientField("field"),
    ],
    selectedLayerId: "map",
    composition: { width: N, height: N },
    sceneConfig: DEFAULT_SCENE_CONFIG,
    timeline: { duration: 2, loop: true, tracks },
  }
}

function storeChecks() {
  let samples = 0
  applyLabProjectFile(parseLabProjectFileValue(project(THERMAL)), [])
  const timeline = () => useTimelineStore.getState()
  const layers = () => useLayerStore.getState().layers
  const binding = createParamBinding(useLayerStore.getState().getLayerById("map"), "stops")
  timeline().setDuration(2)
  timeline().setCurrentTime(0)
  timeline().upsertKeyframe({ binding, layerId: "map", value: THERMAL })
  timeline().setCurrentTime(2)
  timeline().upsertKeyframe({ binding, layerId: "map", value: DUOTONE })
  let track = timeline().tracks.find((t) => t.layerId === "map")
  assert(
    track &&
      track.binding.valueType === "gradient" &&
      track.keyframes.length === 2 &&
      track.keyframes.every((k) => canonical(k.easing) === canonical(SMOOTH)),
    `Keyframe button must create a smooth ramp track: ${canonical(track)}`
  )
  const evaluate = (time) =>
    evaluateTimelineForLayers(layers(), timeline().tracks, time)[0]?.params.stops
  const runtimeEvaluate = (time) =>
    resolveEvaluatedLayers(
      layers().map((l) => ({ ...l, params: { ...l.params } })),
      structuredClone(timeline().tracks),
      time
    ).find((l) => l.id === "map").params.stops
  for (const time of [0, 0.5, 1, 1.7, 2, 3]) {
    const progress = Math.min(1, Math.max(0, time / 2))
    const expected = interpolateGradientMapStops(THERMAL, DUOTONE, resolveEasing(progress, SMOOTH))
    assert(evaluate(time) === expected, `Editor evaluation at ${time}: ${evaluate(time)}`)
    assert(runtimeEvaluate(time) === expected, `Runtime evaluation at ${time}`)
    samples += 2
  }
  assert(
    resolveEasing(0.25, SMOOTH) < 0.2 &&
      evaluate(0.5) !== interpolateGradientMapStops(THERMAL, DUOTONE, 0.25),
    "Keyframe easing must shape the blend"
  )
  timeline().setKeyframeEasing(track.id, track.keyframes[0].id, { type: "step" })
  assert(evaluate(1.9) === THERMAL, "Step easing holds the first ramp")
  timeline().setKeyframeEasing(track.id, track.keyframes[0].id, LINEAR)
  assert(
    evaluate(0.5) === interpolateGradientMapStops(THERMAL, DUOTONE, 0.25),
    "Linear easing blends evenly"
  )
  samples += 3
  timeline().upsertKeyframe({ binding, layerId: "map", time: 2, value: SEPIA })
  track = timeline().tracks.find((t) => t.layerId === "map")
  assert(
    track.keyframes.length === 2 && track.keyframes[1].value === SEPIA,
    "Auto-key at an existing keyframe must update it"
  )
  timeline().pruneTracks(layers())
  assert(timeline().tracks.length === 1, "Pruning must keep ramp tracks")
  samples += 2

  const before = buildEditorHistorySnapshot()
  const tracksBefore = canonical(timeline().tracks)
  timeline().clearLayerTracks("map")
  useLayerStore.getState().updateLayerParam("map", "stops", NEON)
  applyEditorHistorySnapshot(before)
  assert(canonical(timeline().tracks) === tracksBefore, "History must restore the ramp track")
  assert(useLayerStore.getState().getLayerById("map").params.stops === THERMAL, "History base ramp")
  samples += 2

  const [copyId] = duplicateLayers(["map"])
  const copyTrack = timeline().tracks.find((t) => t.layerId === copyId)
  assert(
    copyTrack &&
      copyTrack.id !== track.id &&
      copyTrack.keyframes.map((k) => k.value).join() === track.keyframes.map((k) => k.value).join(),
    "Duplicating the layer must copy its ramp track"
  )
  timeline().upsertKeyframe({ binding, layerId: copyId, time: 2, value: NEON })
  assert(
    timeline().tracks.find((t) => t.layerId === "map").keyframes[1].value === SEPIA,
    "Duplicate tracks must be independent"
  )
  applyEditorHistorySnapshot(before)
  samples += 2

  const saved = JSON.parse(JSON.stringify(buildLabProjectFile()))
  useLayerStore.getState().replaceState([])
  timeline().replaceState({ ...timeline(), tracks: [] })
  applyLabProjectFile(parseLabProjectFileValue(saved), [])
  const reopened = buildLabProjectFile()
  assert(canonical(reopened.timeline.tracks) === tracksBefore, "Save/reopen must keep the ramp track")
  const config = buildShaderExportConfig(reopened)
  const exported = config.timeline.tracks.find((t) => t.layerId === "map")
  assert(
    exported.binding.valueType === "gradient" && exported.keyframes[1].value === SEPIA,
    "Shader export must carry the ramp track"
  )
  assert(
    resolveEvaluatedLayers(config.layers, config.timeline.tracks, 1.2).find((l) => l.id === "map")
      .params.stops === evaluate(1.2),
    "Exported config must evaluate like the editor"
  )
  samples += 3
  return samples
}

async function passChecks() {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  let samples = 0
  try {
    for (const [name, Pass] of [
      ["editor", GradientMapPass],
      ["runtime", RuntimeGradientMap],
    ]) {
      const pass = new Pass(`keyframes-${name}`)
      const data = pass.lut.image.data
      const version = () => pass.lut.version
      const start = version()
      pass.updateParams({ stops: THERMAL })
      assert(version() === start, `${name}: the default ramp must not rebuild the LUT`)
      const mid = interpolateGradientMapStops(THERMAL, DUOTONE, 0.5)
      pass.updateParams({ stops: mid })
      assert(version() === start + 1, `${name}: a new ramp must rebuild the LUT once`)
      pass.updateParams({ stops: `${mid}` })
      assert(version() === start + 1, `${name}: an unchanged ramp must not rebuild the LUT`)
      assert(pass.lut.image.data === data, `${name}: the LUT must be rewritten in place`)
      assert(
        maxDelta(data, buildLinearColorMap(parseGradientMapStops(mid))) === 0,
        `${name}: in-place LUT must match the allocating builder`
      )
      pass.dispose()
      samples += 5
    }
  } finally {
    renderer.dispose()
  }
  return samples
}

async function runtimeRender(config, time) {
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

const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

async function renderChecks(renderProject) {
  let samples = 0
  const diff = (a, b) => maxDelta(a.image.data, b.image.data)
  const animated = project(THERMAL, [rampTrack("map", [[0, THERMAL], [2, DUOTONE]])])
  const staticThermal = await renderProject(project(THERMAL))
  const staticDuotone = await renderProject(project(DUOTONE))
  const mid = interpolateGradientMapStops(THERMAL, DUOTONE, resolveEasing(0.5, SMOOTH))
  const staticMid = await renderProject(project(mid))
  const at0 = await renderProject(animated, 0)
  const at1 = await renderProject(animated, 1)
  const at2 = await renderProject(animated, 2)
  assert(diff(at0, staticThermal) === 0, "Animated ramp at its first keyframe must match the static ramp")
  assert(diff(at2, staticDuotone) === 0, "Animated ramp at its last keyframe must match the static ramp")
  assert(diff(at1, staticMid) === 0, "Animated ramp mid-way must match the interpolated ramp")
  assert(
    diff(at1, staticThermal) > 20 && diff(at1, staticDuotone) > 20,
    `The mid frame must differ from both keyframes (${diff(at1, staticThermal)}, ${diff(at1, staticDuotone)})`
  )
  samples += 4
  const flat = await renderProject(project(THERMAL, [rampTrack("map", [[0, THERMAL], [2, THERMAL]])]), 1)
  assert(diff(flat, staticThermal) === 0, "A track holding the base ramp must not change the image")
  const stale = await renderProject(project(NEON, [rampTrack("map", [[0, THERMAL], [2, DUOTONE]])]), 1)
  assert(diff(stale, staticMid) === 0, "The track must override the base ramp")
  const disabled = project(THERMAL, [{ ...rampTrack("map", [[0, NEON], [2, DUOTONE]]), enabled: false }])
  assert(diff(await renderProject(disabled, 1), staticThermal) === 0, "Disabled ramp tracks fall back to the base ramp")
  samples += 3
  const glide = project(THERMAL, [rampTrack("map", [[0, THERMAL, LINEAR], [2, MOVED]])])
  const glideMid = await renderProject(glide, 1)
  const staticGlide = await renderProject(project(interpolateGradientMapStops(THERMAL, MOVED, 0.5)))
  assert(diff(glideMid, staticGlide) === 0, "Gliding stops render the interpolated ramp")
  samples++
  const config = buildShaderExportConfig(parseLabProjectFileValue(animated))
  for (const [time, editor] of [
    [1, at1],
    [2, at2],
  ]) {
    const runtime = await runtimeRender(config, time)
    let worst = 0
    editor.image.data.forEach((value, i) => {
      const expected = i % 4 === 3 ? value / 255 : linear(value / 255)
      worst = Math.max(worst, Math.abs(runtime[i] - expected))
    })
    assert(worst <= 0.02, `Runtime export parity at ${time}s: ${worst}`)
    samples++
  }
  return { samples, staticThermal }
}

async function photoFrames(renderProject) {
  const asset = {
    id: "photo-asset",
    kind: "image",
    url: "/scenes/default/rings-photo.webp",
    fileName: "slice.webp",
    width: 1512,
    height: 908,
  }
  const art = {
    format: "shader-lab",
    version: 7,
    composition: { width: 600, height: 360 },
    assets: [asset],
    layers: [
      { ...createLayer("gradient-map"), id: "photo-map" },
      { ...createLayer("image"), id: "photo", assetId: asset.id },
    ],
    selectedLayerId: "photo-map",
    sceneConfig: { ...DEFAULT_SCENE_CONFIG, backgroundColor: "#08083a" },
    timeline: {
      duration: 3,
      loop: true,
      tracks: [rampTrack("photo-map", [[0, THERMAL], [1.5, NEON], [3, DUOTONE]])],
    },
  }
  const frames = {}
  for (const time of [0, 0.75, 1.5, 2.25, 3]) {
    frames[`t${time.toFixed(2).replace(".", "_")}`] = (await renderProject(art, time)).png
  }
  return frames
}

export async function checkGradientMapKeyframes(renderProject) {
  let samples = interpolationChecks()
  samples += bindingChecks()
  samples += storeChecks()
  samples += await passChecks()
  const rendered = await renderChecks(renderProject)
  samples += rendered.samples
  const frames = await photoFrames(renderProject)
  return { samples, frames }
}
