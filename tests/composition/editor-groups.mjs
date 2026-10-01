import { buildRendererFrame as runtimeFrame } from "@runtime/renderer/contracts"
import { createHeadlessRenderer } from "@runtime/renderer/create-headless-renderer"
import { texture } from "three/tsl"
import * as THREE from "three/webgpu"
import { duplicateLayers } from "@/lib/editor/duplicate-layers"
import {
  applyEditorHistorySnapshot,
  buildEditorHistorySnapshot,
} from "@/lib/editor/history"
import {
  selectionRoots,
  subtreeLayers,
  visibleLayerRows,
} from "@/lib/editor/layer-groups"
import { createLayer } from "@/lib/editor/layers"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { buildShaderExportConfig } from "@/lib/editor/shader-export"
import { buildRendererFrame } from "@/renderer/contracts"
import { useAssetStore } from "@/store/asset-store"
import { useAudioStore } from "@/store/audio-store"
import { useEditorStore } from "@/store/editor-store"
import { useHistoryStore } from "@/store/history-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"
import { checkLayerDrops } from "./layer-drops.mjs"

function assert(value, message) {
  if (!value) throw new Error(message)
}
function canonical(value) {
  return JSON.stringify(value, (_, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))
        )
      : entry
  )
}
function equal(actual, expected, message) {
  assert(
    canonical(actual) === canonical(expected),
    `${message}: ${JSON.stringify(actual)}`
  )
}
function solid(id, color, opacity = 1) {
  const layer = createLayer("gradient")
  return {
    ...layer,
    id,
    opacity,
    params: {
      ...layer.params,
      animate: false,
      tonemapMode: "none",
      grainAmount: 0,
      glowStrength: 0,
      vignetteStrength: 0,
      ...Object.fromEntries(
        [1, 2, 3, 4, 5].map((i) => [`point${i}Color`, color])
      ),
    },
  }
}
function track(layerId, property, value) {
  return {
    id: `track-${layerId}-${property}`,
    layerId,
    enabled: true,
    binding: {
      kind: "layer",
      property,
      label: property,
      valueType: typeof value,
    },
    keyframes: [
      {
        id: `key-${layerId}-${property}`,
        time: 0,
        value,
        easing: { type: "bezier", controlPoints: [0, 0, 1, 1] },
      },
    ],
  }
}

async function checkRuntime(config) {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  const compilations = []
  const compile = renderer.compileAsync.bind(renderer)
  renderer.compileAsync = (...args) => {
    const pending = compile(...args)
    compilations.push(pending)
    return pending
  }
  const headless = createHeadlessRenderer({
    renderer,
    size: { width: 1, height: 1 },
  })
  const target = new THREE.RenderTarget(1, 1, {
    type: THREE.FloatType,
    depthBuffer: false,
  })
  const material = new THREE.MeshBasicNodeMaterial({
    blending: THREE.NoBlending,
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(geometry, material))
  try {
    await headless.initialize()
    const frame = runtimeFrame(config, 0, 0, 1, { width: 1, height: 1 })
    headless.render(frame)
    while (compilations.length) await Promise.all(compilations.splice(0))
    material.colorNode = texture(headless.render(frame))
    renderer.setRenderTarget(target)
    renderer.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1))
    const pixel = Array.from(
      await renderer.readRenderTargetPixelsAsync(target, 0, 0, 1, 1)
    )
    assert(
      pixel.every(
        (value, i) => Math.abs(value - [0.25, 0.25, 1, 1][i]) < 0.002
      ),
      `Exported runtime group scope: ${pixel}`
    )
  } finally {
    headless.dispose()
    target.dispose()
    material.dispose()
    geometry.dispose()
    renderer.dispose()
  }
}

export async function checkEditorGroups(renderProject) {
  checkLayerDrops()
  const store = () => useLayerStore.getState()
  const timeline = () => useTimelineStore.getState()
  const size = { width: 64, height: 48 }
  const red = solid("red", "#ff0000", 0.5)
  const blue = solid("blue", "#0000ff")
  const effect = {
    ...createLayer("threshold"),
    id: "effect",
    params: {
      threshold: 0.1,
      softness: 0.01,
      noise: 0,
      invert: false,
      darkColor: "#000000",
      lightColor: "#ffffff",
    },
  }
  useAssetStore.getState().replaceAssets([])
  useAudioStore.setState({ links: [], source: null })
  useEditorStore.setState({
    outputSize: size,
    sceneConfig: {
      ...DEFAULT_SCENE_CONFIG,
      compositionWidth: 64,
      compositionHeight: 48,
    },
  })
  store().replaceState([effect, red, blue], red.id, null, [effect.id, red.id])
  timeline().replaceState({
    currentTime: 0,
    duration: 1,
    isPlaying: false,
    loop: true,
    selectedTrackId: null,
    selectedKeyframeId: null,
    selectedKeyframeIds: [],
    tracks: [track(red.id, "opacity", 0.5)],
  })
  const beforeGroup = buildEditorHistorySnapshot()
  const groupId = store().groupLayers([effect.id, red.id])
  assert(groupId, "Grouping selected siblings failed")
  equal(
    store().layers.map((layer) => layer.id),
    [groupId, "effect", "red", "blue"],
    "Group order"
  )
  assert(
    store().getLayerById("red").parentId === groupId,
    "Source lost group membership"
  )
  assert(
    store().getLayerById("effect").parentId === groupId,
    "Effect lost group membership"
  )
  equal(
    selectionRoots(store().layers, [groupId, "red"]).map((layer) => layer.id),
    [groupId],
    "Selected parent covers its descendants"
  )

  useHistoryStore.getState().clearHistory()
  useHistoryStore.getState().pushSnapshot("Group layers", beforeGroup)
  applyEditorHistorySnapshot(
    useHistoryStore.getState().undo(buildEditorHistorySnapshot())
  )
  equal(store().layers, beforeGroup.layers, "Undo grouping restores layers")
  equal(
    store().selectedLayerIds,
    ["effect", "red"],
    "Undo grouping restores selection"
  )
  applyEditorHistorySnapshot(
    useHistoryStore.getState().redo(buildEditorHistorySnapshot())
  )
  assert(
    store().getLayerById("red").parentId === groupId,
    "Redo grouping restores hierarchy"
  )

  store().renameLayer(groupId, "Portrait")
  store().selectLayer("red")
  store().setLayerExpanded(groupId, false)
  equal(
    visibleLayerRows(store().layers).map((layer) => layer.id),
    [groupId, "blue"],
    "Collapsed rows hide contents"
  )
  equal(
    store().selectedLayerIds,
    [groupId],
    "Collapsing a selected child selects its parent"
  )
  store().selectLayerWithModifiers("blue", { range: true })
  equal(
    store().selectedLayerIds,
    [groupId, "blue"],
    "Range selection excludes collapsed descendants"
  )
  store().setLayerExpanded(groupId, true)
  store().selectLayer(groupId)
  const added = store().addLayer("posterize")
  assert(
    store().getLayerById(added).parentId === groupId,
    "New layers enter selected group"
  )
  store().removeLayer(added)
  store().reorderSiblings(null, ["blue", groupId])
  equal(
    store().layers.map((layer) => layer.id),
    ["blue", groupId, "effect", "red"],
    "Reordering moves complete subtree"
  )
  store().reorderSiblings(null, [groupId, "blue"])
  store().moveLayer("red", null)
  assert(store().getLayerById("red").parentId === null, "Move out of group")
  store().moveLayer("red", groupId)
  store().reorderSiblings(groupId, ["effect", "red"])
  const nestedId = store().groupLayers([groupId])
  assert(nestedId, "Nested group creation failed")
  const beforeCycle = store().layers
  store().moveLayer(nestedId, groupId)
  assert(
    store().layers === beforeCycle,
    "Moving parent into descendant created a cycle"
  )
  store().ungroupLayer(nestedId)
  assert(
    store().getLayerById(groupId).parentId === null,
    "Ungroup lifts direct children"
  )

  store().setLayerOpacity(groupId, 0.5)
  timeline().replaceState({
    ...timeline(),
    tracks: [track("red", "opacity", 0.5), track(groupId, "opacity", 0.5)],
  })
  const sourceTracks = structuredClone(timeline().tracks)
  useAudioStore.setState({
    links: [
      {
        id: "audio-red",
        layerId: "red",
        band: "bass",
        enabled: true,
        binding: sourceTracks[0].binding,
        outMin: 0.2,
        outMax: 0.8,
      },
    ],
  })
  const [copyId] = duplicateLayers([groupId, "red"])
  assert(copyId, "Group duplication failed")
  const copies = subtreeLayers(store().layers, copyId)
  assert(
    copies.length === 3,
    "Duplicating parent and child duplicated contents twice"
  )
  assert(
    copies.slice(1).every((layer) => layer.parentId === copyId),
    "Duplicate children reference original parent"
  )
  assert(
    new Set(store().layers.map((layer) => layer.id)).size ===
      store().layers.length,
    "Duplicated group reused IDs"
  )
  const copyRed = copies.find((layer) => layer.type === "gradient")
  assert(
    useAudioStore.getState().links.some((link) => link.layerId === copyRed.id),
    "Duplicating group lost child audio links"
  )
  assert(
    timeline().tracks.some((entry) => entry.layerId === copyRed.id),
    "Child animation was not duplicated"
  )
  assert(
    timeline().tracks.some((entry) => entry.layerId === copyId),
    "Group animation was not duplicated"
  )
  equal(
    timeline().tracks.filter(
      (entry) => entry.layerId === "red" || entry.layerId === groupId
    ),
    sourceTracks,
    "Duplicating keeps original animation"
  )
  store().removeLayer(copyId)
  assert(
    copies.every((layer) => !store().getLayerById(layer.id)),
    "Deleting group left orphan children"
  )
  assert(
    useAudioStore.getState().links.length === 1 &&
      useAudioStore.getState().links[0].layerId === "red",
    "Deleting group left orphan audio links"
  )
  assert(
    timeline().tracks.length === sourceTracks.length,
    "Deleting group left dangling animation tracks"
  )
  store().selectLayer(groupId)

  store().setLayerExpanded(groupId, false)
  const project = buildLabProjectFile()
  assert(project.version === 7, "Grouped project is not version 7")
  const persisted = parseLabProjectFileValue(
    JSON.parse(JSON.stringify(project))
  )
  store().replaceState([createLayer("text")])
  timeline().replaceState({ ...timeline(), tracks: [] })
  applyLabProjectFile(persisted, [])
  equal(
    store().layers,
    project.layers,
    "Actual editor hydration changed group state"
  )
  equal(
    timeline().tracks,
    project.timeline.tracks,
    "Actual editor hydration lost group/child animation"
  )
  equal(
    buildLabProjectFile().layers,
    project.layers,
    "Saving hydrated groups changed hierarchy"
  )

  const frameInput = {
    layers: store().layers,
    assets: [],
    timeline: timeline(),
    sceneConfig: DEFAULT_SCENE_CONFIG,
    delta: 0,
    outputSize: size,
    viewportSize: size,
    pixelRatio: 1,
  }
  const frame = buildRendererFrame(frameInput)
  assert(
    frame.layers[0].kind === "group" && frame.layers[0].children.length === 2,
    "Editor frame flattened the group"
  )
  assert(frame.layers[0].opacity === 0.5, "Group animation was not evaluated")
  const hiddenFrame = buildRendererFrame({
    ...frameInput,
    timeline: {
      ...timeline(),
      tracks: [...timeline().tracks, track(groupId, "visible", false)],
    },
  })
  assert(
    hiddenFrame.layers.length === 1 &&
      hiddenFrame.layers[0].layer.id === "blue",
    "Hidden parent leaked children into scene"
  )

  const exportedConfig = buildShaderExportConfig({
    assets: [],
    composition: size,
    layers: store().layers,
    timeline: timeline(),
  })
  assert(
    exportedConfig.layers.find((layer) => layer.id === "red").parentId ===
      groupId,
    "Shader export dropped membership"
  )
  await checkRuntime(JSON.parse(JSON.stringify(exportedConfig)))

  const rendered = await renderProject(persisted)
  const pixel = Array.from(rendered.image.data.slice(0, 4))
  assert(
    pixel.every((value, i) => Math.abs(value - [137, 137, 255, 255][i]) <= 1),
    `Saved editor group effect leaked: ${pixel}`
  )
  const reopened = await renderProject(
    parseLabProjectFileValue(JSON.parse(JSON.stringify(buildLabProjectFile())))
  )
  equal(
    Array.from(reopened.image.data),
    Array.from(rendered.image.data),
    "Reopened grouped project changed pixels"
  )

  const invalidStacks = [
    [{ ...red, parentId: "missing" }],
    [red, { ...red }],
    [{ ...red, parentId: groupId }, project.layers[0]],
    [project.layers[0], blue, { ...red, parentId: groupId }],
  ]
  const tooDeep = []
  for (let i = 0; i < 9; i++)
    tooDeep.push({
      ...createLayer("group"),
      id: `depth-${i}`,
      parentId: i ? `depth-${i - 1}` : null,
    })
  invalidStacks.push(tooDeep)
  for (const layers of invalidStacks) {
    let rejected = false
    try {
      parseLabProjectFileValue({ ...project, layers })
    } catch {
      rejected = true
    }
    assert(rejected, "Invalid saved group hierarchy was accepted")
    const previous = store().layers
    rejected = false
    try {
      applyLabProjectFile({ ...project, layers }, [])
    } catch {
      rejected = true
    }
    assert(
      rejected && store().layers === previous,
      "Invalid hydration changed live stores"
    )
  }
  store().replaceState(tooDeep.slice(0, 8), "depth-7")
  assert(
    store().groupLayers(["depth-7"]) === null,
    "Store allowed a ninth group level"
  )
  applyLabProjectFile(persisted, [])
  return {
    png: rendered.png,
    layers: store().layers.length,
    tracks: timeline().tracks.length,
  }
}
