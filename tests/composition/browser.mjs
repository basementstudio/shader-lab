import { checkCleanProjects } from "./clean-projects.mjs"
import { checkThresholdColors } from "./threshold-colors.mjs"
import { buildBlendNode as buildRuntimeBlendNode } from "@runtime/renderer/blend-modes"
import { float, vec4 } from "three/tsl"
import * as THREE from "three/webgpu"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  buildViewerProjectState,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildBlendNode } from "@/renderer/blend-modes"
import { buildRendererFrame } from "@/renderer/contracts"
import { createWebGPURenderer } from "@/renderer/create-webgpu-renderer"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import { BLEND_MODES } from "@/types/editor"
import { checkAlphaCompositing } from "./alpha-compositing.mjs"
import { checkGroups } from "./groups.mjs"
import { checkEditorGroups } from "./editor-groups.mjs"
import { checkMediaBounds } from "./media-bounds.mjs"
import { checkTransparentText } from "./transparent-text.mjs"
import { checkPhotographicCells } from "./photographic-cells.mjs"
import { checkLayerMasks } from "./layer-masks.mjs"
import { checkDisplacedRings } from "./displaced-rings.mjs"

function pixels(canvas) {
  const copy = document.createElement("canvas")
  copy.width = canvas.width
  copy.height = canvas.height
  const context = copy.getContext("2d", { willReadFrequently: true })
  context.drawImage(canvas, 0, 0)
  return context.getImageData(0, 0, copy.width, copy.height)
}

function canonicalJson(value) {
  return JSON.stringify(value, (_key, entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))
      )
    }
    return entry
  })
}

function compare(actual, expected, tolerance = 0) {
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error("Image dimensions changed")
  }
  let changedPixels = 0
  let maxDelta = 0
  for (let index = 0; index < actual.data.length; index += 4) {
    let delta = 0
    for (let channel = 0; channel < 4; channel++) {
      delta = Math.max(
        delta,
        Math.abs(actual.data[index + channel] - expected.data[index + channel])
      )
    }
    if (delta > tolerance) changedPixels++
    maxDelta = Math.max(maxDelta, delta)
  }
  return { changedPixels, maxDelta }
}

async function settle(renderer, frame) {
  renderer.render(frame)
  const deadline = performance.now() + 30_000
  while (renderer.hasPendingResources()) {
    if (performance.now() > deadline)
      throw new Error(
        `Timed out loading or compiling a fixture (compilation pending: ${renderer.hasPendingCompilations()})`
      )
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  await renderer.prepareForExportFrame(frame.clock.timelineTime, true)
  renderer.render(frame)
  await renderer.waitForGpuIdle()
}

async function renderProject(value) {
  const project = parseLabProjectFileValue(value)
  const state = buildViewerProjectState(project)
  const size = project.composition
  const canvas = document.createElement("canvas")
  const renderer = await createWebGPURenderer(canvas, {
    strictPassFailures: true,
  })
  try {
    await renderer.initialize()
    renderer.resize(size, 1)
    const frame = buildRendererFrame({
      ...state,
      outputSize: size,
      viewportSize: size,
      delta: 0,
      clockTime: 0,
      pixelRatio: 1,
      timeline: { ...state.timeline, currentTime: 0, isPlaying: false },
    })
    await settle(renderer, frame)
    const preview = pixels(canvas)
    const exported = renderer.exportFrame(frame, size)
    const exportDiff = compare(preview, pixels(exported))
    if (exportDiff.changedPixels)
      throw new Error(`Preview/export mismatch: ${JSON.stringify(exportDiff)}`)
    return { image: preview, png: exported.toDataURL("image/png") }
  } finally {
    renderer.dispose()
    await renderer.destroyDevice()
  }
}

window.checkProject = async (name, update) => {
  const file = await (await fetch(`/fixtures/${name}.json`)).json()
  const first = await renderProject(file)
  // Reopen a serialized project in a new renderer/device, with fresh textures.
  const reopened = await renderProject(
    JSON.parse(JSON.stringify(parseLabProjectFileValue(file)))
  )
  const reopenDiff = compare(first.image, reopened.image)
  if (reopenDiff.changedPixels)
    throw new Error(`Reopen mismatch: ${JSON.stringify(reopenDiff)}`)
  const colors = new Set()
  for (let i = 0; i < first.image.data.length; i += 4) {
    colors.add(
      `${first.image.data[i]},${first.image.data[i + 1]},${first.image.data[i + 2]}`
    )
    if (first.image.data[i + 3] !== 255)
      throw new Error("Legacy fixture unexpectedly became transparent")
  }
  if (colors.size < 8)
    throw new Error("Fixture is blank or has lost its content")
  let baselineDiff = null
  if (!update) {
    const response = await fetch(`/baselines/${name}.png`)
    if (!response.ok) throw new Error(`Missing baseline: ${name}`)
    const bitmap = await createImageBitmap(await response.blob())
    const reference = document.createElement("canvas")
    reference.width = bitmap.width
    reference.height = bitmap.height
    reference.getContext("2d").drawImage(bitmap, 0, 0)
    bitmap.close()
    baselineDiff = compare(first.image, pixels(reference), 2)
  }
  return { png: first.png, baselineDiff, reopenDiff, colors: colors.size }
}

window.checkLegacyBlendContract = async () => {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const target = new THREE.RenderTarget(1, 1, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    blending: THREE.NoBlending,
  })
  const mesh = new THREE.Mesh(geometry, material)
  const scene = new THREE.Scene()
  scene.add(mesh)
  const results = []
  try {
    for (const [implementation, build] of [
      ["editor", buildBlendNode],
      ["runtime", buildRuntimeBlendNode],
    ]) {
      for (const mode of BLEND_MODES) {
        for (const opacity of [0, 0.35, 1]) {
          material.colorNode = build(
            mode,
            vec4(0.2, 0.6, 0.9, 1),
            vec4(0.8, 0.3, 0.1, 0.5),
            float(opacity)
          )
          material.needsUpdate = true
          renderer.setRenderTarget(target)
          renderer.render(scene, camera)
          const data = await renderer.readRenderTargetPixelsAsync(
            target,
            0,
            0,
            1,
            1
          )
          results.push({
            implementation,
            mode,
            opacity,
            rgba: Array.from(data),
          })
        }
      }
      for (const source of ["alpha", "red", "green", "blue", "luminance"]) {
        for (const mode of ["multiply", "stencil"]) {
          for (const invert of [false, true]) {
            material.colorNode = build(
              "normal",
              vec4(0.2, 0.6, 0.9, 1),
              vec4(0.8, 0.3, 0.1, 0.5),
              float(1),
              "mask",
              { source, mode, invert }
            )
            material.needsUpdate = true
            renderer.render(scene, camera)
            const data = await renderer.readRenderTargetPixelsAsync(
              target,
              0,
              0,
              1,
              1
            )
            results.push({
              implementation,
              source,
              mode,
              invert,
              rgba: Array.from(data),
            })
          }
        }
      }
    }
    return results
  } finally {
    target.dispose()
    material.dispose()
    geometry.dispose()
    renderer.dispose()
    renderer.backend.device.destroy()
  }
}

window.checkExistingProject = async () => {
  const original = await (
    await fetch("/fixtures/existing-default-project.json")
  ).json()
  const parsed = parseLabProjectFileValue(original)
  const reopened = parseLabProjectFileValue(JSON.parse(JSON.stringify(parsed)))
  if (JSON.stringify(parsed) !== JSON.stringify(reopened))
    throw new Error("Saved project is not stable across parse/serialize/reopen")
  const state = buildViewerProjectState(reopened)
  const expectedRestored = structuredClone(reopened)
  for (const layer of expectedRestored.layers) {
    if (layer.type === "image" || layer.type === "video") {
      layer.params.transparentBounds = false
    }
  }
  // Start from a different editor session so no-op restoration cannot pass
  // merely because the stores already contain their default values.
  useLayerStore.getState().replaceState([], null, null)
  useAssetStore.getState().replaceAssets([])
  useEditorStore.getState().updateSceneConfig({ exposure: 2 })
  useEditorStore.getState().setOutputSize(320, 240)
  useTimelineStore.setState({ currentTime: 3, isPlaying: false, loop: false })
  const revision = useEditorStore.getState().sceneRevision
  const missing = applyLabProjectFile(reopened, [])
  if (missing.missingAssetCount || missing.missingAudioSource) {
    throw new Error("Editor hydration lost bundled media")
  }
  if (useEditorStore.getState().sceneRevision !== revision + 1) {
    throw new Error("Editor did not signal scene replacement")
  }
  const stored = buildLabProjectFile()
  for (const key of [
    "layers",
    "sceneConfig",
    "composition",
    "selectedLayerId",
    "timeline",
    "audio",
  ]) {
    if (JSON.stringify(stored[key]) !== JSON.stringify(expectedRestored[key])) {
      throw new Error(`Editor hydration/save changed ${key}`)
    }
  }
  if (
    useAssetStore.getState().assets.length !== original.assets.length ||
    useLayerStore.getState().layers.length !== original.layers.length ||
    useTimelineStore.getState().currentTime !== 0
  ) {
    throw new Error("Editor stores were not restored")
  }
  if (
    state.layers.length !== original.layers.length ||
    state.assets.length !== original.assets.length
  ) {
    throw new Error("Existing project lost layers or bundled assets")
  }
  for (const [index, layer] of state.layers.entries()) {
    const saved = expectedRestored.layers[index]
    for (const key of [
      "blendMode",
      "compositeMode",
      "maskConfig",
      "opacity",
      "params",
    ]) {
      if (JSON.stringify(layer[key]) !== JSON.stringify(saved[key]))
        throw new Error(`Existing ${layer.type} layer changed ${key}`)
    }
  }
  const validTrack = {
    id: "hydration-opacity",
    layerId: reopened.layers[0].id,
    binding: {
      kind: "layer",
      property: "opacity",
      label: "Opacity",
      valueType: "number",
    },
    enabled: true,
    keyframes: [
      {
        id: "opacity-start",
        time: 0,
        value: 0.25,
        easing: { type: "bezier", controlPoints: [0, 0, 1, 1] },
      },
      {
        id: "opacity-end",
        time: 1,
        value: 1,
        easing: { type: "bezier", controlPoints: [0, 0, 1, 1] },
      },
    ],
  }
  const tracks = [
    validTrack,
    { ...validTrack, id: "missing-layer", layerId: "deleted-layer" },
    {
      ...validTrack,
      id: "missing-parameter",
      binding: {
        kind: "param",
        key: "removed-parameter",
        label: "Removed",
        valueType: "number",
      },
    },
  ]
  const withTracks = structuredClone(reopened)
  withTracks.timeline.tracks = tracks
  withTracks.selectedLayerId = "deleted-layer"
  useTimelineStore.setState({
    tracks: [{ ...validTrack, id: "previous-session-track" }],
    currentTime: 3,
    isPlaying: false,
    selectedTrackId: "previous-session-track",
    selectedKeyframeId: "previous-session-keyframe",
    selectedKeyframeIds: ["previous-session-keyframe"],
  })
  applyLabProjectFile(withTracks, useAssetStore.getState().assets)
  const timeline = useTimelineStore.getState()
  if (canonicalJson(timeline.tracks) !== canonicalJson([validTrack])) {
    throw new Error(
      `Hydration must retain valid tracks and prune missing layers/parameters: ${JSON.stringify(timeline.tracks)}`
    )
  }
  if (
    timeline.currentTime !== 0 ||
    !timeline.isPlaying ||
    timeline.selectedTrackId !== null ||
    timeline.selectedKeyframeId !== null ||
    timeline.selectedKeyframeIds.length !== 0 ||
    useLayerStore.getState().selectedLayerId !== null
  ) {
    throw new Error(
      "Hydration retained stale timeline state or an invalid layer selection"
    )
  }
  if (
    canonicalJson(buildLabProjectFile().timeline.tracks) !==
    canonicalJson([validTrack])
  ) {
    throw new Error("Saving restored pruned timeline tracks")
  }
  return { layers: state.layers.length, assets: state.assets.length }
}

window.checkMediaBounds = () => checkMediaBounds(renderProject)
window.checkAlphaCompositing = checkAlphaCompositing
window.checkGroups = checkGroups
window.checkEditorGroups = () => checkEditorGroups(renderProject)
window.checkTransparentText = () => checkTransparentText(renderProject)
window.checkDisplacedRings = () => checkDisplacedRings(renderProject)

window.checkPhotographicCells = () => checkPhotographicCells(renderProject)

window.checkThresholdColors = () => checkThresholdColors(renderProject)

window.checkCleanProjects = checkCleanProjects

window.checkLayerMasks = () => checkLayerMasks(renderProject)
