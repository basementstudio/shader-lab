import { getBlankProjectFile } from "@/lib/editor/blank-project"
import { getDefaultProjectFile } from "@/lib/editor/default-project"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { replaceWithNewProject } from "@/lib/editor/project-start"
import {
  hasSceneAdjustments,
  neutralSceneAdjustments,
} from "@/lib/editor/scene-adjustments"
import {
  applyEditorHistorySnapshot,
  buildEditorHistorySnapshot,
} from "@/lib/editor/history"
import { chooseAutosaveRecord } from "@/lib/editor/autosave/record"
import { AUTOSAVE_SCHEMA_VERSION } from "@/lib/editor/autosave/limits"
import { armRemixDraft, readArmedRemixDraft } from "@/lib/editor/remix-draft"
import { useAssetStore } from "@/store/asset-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useAudioStore } from "@/store/audio-store"
import { useTimelineStore } from "@/store/timeline-store"
import { useHistoryStore } from "@/store/history-store"
import { useDraftStore } from "@/store/draft-store"
import { useRemixOriginStore } from "@/store/remix-origin-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

function equal(actual, expected, message) {
  const canonical = (value) =>
    JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(
            Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
          )
        : v
    )
  if (canonical(actual) !== canonical(expected)) throw new Error(message)
}
function blankState() {
  equal(useLayerStore.getState().layers, [], "Blank retained layers")
  equal(
    useLayerStore.getState().selectedLayerIds,
    [],
    "Blank retained selection"
  )
  equal(useAssetStore.getState().assets, [], "Blank retained media")
  equal(
    useAudioStore.getState().getSnapshot(),
    getBlankProjectFile().audio,
    "Blank retained audio"
  )
  equal(useTimelineStore.getState().tracks, [], "Blank retained tracks")
  equal(
    useEditorStore.getState().sceneConfig,
    DEFAULT_SCENE_CONFIG,
    "Blank inherited global settings"
  )
}

export function checkCleanProjects() {
  // Runs before any hydration in the harness: verifies actual store initializers.
  blankState()
  equal(
    hasSceneAdjustments(useEditorStore.getState().sceneConfig),
    false,
    "Neutral scene marked active"
  )
  const first = getBlankProjectFile()
  first.sceneConfig.channelMixer.rr = 0.3
  equal(
    getBlankProjectFile().sceneConfig.channelMixer.rr,
    1,
    "Blank defaults alias a previous document"
  )

  replaceWithNewProject("demo")
  const demo = getDefaultProjectFile()
  equal(
    useEditorStore.getState().sceneConfig,
    demo.sceneConfig,
    "Opening demo changed authored grading"
  )
  equal(
    useLayerStore.getState().layers.length,
    demo.layers.length,
    "Demo lost layers"
  )
  equal(
    useAssetStore.getState().assets.length,
    demo.assets.length,
    "Demo lost media"
  )
  equal(
    hasSceneAdjustments(demo.sceneConfig),
    true,
    "Demo grading is undisclosed"
  )

  const config = structuredClone(DEFAULT_SCENE_CONFIG)
  config.backgroundColor = "#124578"
  config.compositionAspect = "custom"
  config.compositionWidth = 900
  config.compositionHeight = 700
  Object.assign(config, {
    exposure: 1,
    brightness: 0.2,
    contrast: 0.4,
    saturation: 0.5,
    vibrance: 0.2,
    hue: 0.2,
    temperature: 0.2,
    tint: 0.3,
    invert: true,
    clampMin: 0.1,
    clampMax: 0.8,
    clampGamma: 1.3,
    quantizeEnabled: true,
    quantizeLevels: 5,
  })
  config.channelMixer.rg = 0.4
  config.colorCurves.red.points[0].y = 0.2
  config.colorMap = {
    stops: [
      { id: "dark", position: 0, color: "#ff0000" },
      { id: "light", position: 1, color: "#00ff00" },
    ],
  }
  useEditorStore.getState().updateSceneConfig(config)
  useEditorStore.getState().setRenderScale(0.5)
  const before = buildEditorHistorySnapshot()
  useEditorStore.getState().updateSceneConfig(neutralSceneAdjustments())
  const after = buildEditorHistorySnapshot()
  equal(
    hasSceneAdjustments(after.sceneConfig),
    false,
    "Reset left active grading"
  )
  equal(
    after.sceneConfig,
    {
      ...structuredClone(DEFAULT_SCENE_CONFIG),
      backgroundColor: config.backgroundColor,
      compositionAspect: config.compositionAspect,
      compositionWidth: 900,
      compositionHeight: 700,
    },
    "Reset changed background or composition"
  )
  equal(
    useEditorStore.getState().renderScale,
    0.5,
    "Reset changed preview quality"
  )
  applyEditorHistorySnapshot(before)
  equal(useEditorStore.getState().sceneConfig, config, "Undo lost grading")
  applyEditorHistorySnapshot(after)
  equal(
    hasSceneAdjustments(useEditorStore.getState().sceneConfig),
    false,
    "Redo lost reset"
  )
  const disabled = {
    ...structuredClone(DEFAULT_SCENE_CONFIG),
    quantizeLevels: 8,
  }
  equal(
    hasSceneAdjustments(disabled),
    false,
    "Disabled quantization marked active"
  )
  for (const patch of [
    { colorMap: config.colorMap },
    { channelMixer: config.channelMixer },
    { colorCurves: config.colorCurves },
    { quantizeEnabled: true },
    { clampGamma: 2 },
    { exposure: 0.1 },
  ]) {
    equal(
      hasSceneAdjustments({
        ...structuredClone(DEFAULT_SCENE_CONFIG),
        ...patch,
      }),
      true,
      `Missed adjustment ${Object.keys(patch)}`
    )
  }

  useDraftStore
    .getState()
    .setActiveDraft({ id: "previous-draft", title: "Previous", savedAt: null })
  useRemixOriginStore
    .getState()
    .setRemixOrigin({ slug: "previous", title: "Previous" })
  armRemixDraft({ title: "Previous" })
  useHistoryStore.getState().pushSnapshot("Previous", before)
  useTimelineStore.setState({
    currentTime: 3,
    selectedTrackId: "old",
    selectedKeyframeId: "old",
    selectedKeyframeIds: ["old"],
  })
  const revision = useEditorStore.getState().sceneRevision
  replaceWithNewProject("blank")
  blankState()
  equal(
    useEditorStore.getState().sceneRevision,
    revision + 1,
    "Blank did not signal replacement"
  )
  equal(
    useHistoryStore.getState().past,
    [],
    "New project retained undo history"
  )
  equal(
    useHistoryStore.getState().future,
    [],
    "New project retained redo history"
  )
  equal(
    useTimelineStore.getState().currentTime,
    0,
    "New project retained playhead"
  )
  equal(
    useTimelineStore.getState().selectedKeyframeIds,
    [],
    "New project retained keyframe selection"
  )
  equal(
    useDraftStore.getState().activeDraft,
    null,
    "New project linked to old draft"
  )
  equal(
    useRemixOriginStore.getState().origin,
    null,
    "New project linked to old remix"
  )
  equal(readArmedRemixDraft(), null, "New project retained armed remix")
  const saved = buildLabProjectFile()
  replaceWithNewProject("demo")
  // Real editor hydration, never the viewer snapshot, for empty-file compatibility.
  applyLabProjectFile(
    parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))),
    useAssetStore.getState().assets
  )
  equal(
    useLayerStore.getState().layers,
    [],
    "Reopening blank lost empty document"
  )
  equal(
    useEditorStore.getState().sceneConfig,
    DEFAULT_SCENE_CONFIG,
    "Reopening blank changed grading"
  )

  const records = [
    {
      sessionId: "old",
      savedAt: 10,
      schemaVersion: AUTOSAVE_SCHEMA_VERSION,
      projectFile: demo,
    },
    {
      sessionId: "blank",
      savedAt: 20,
      schemaVersion: AUTOSAVE_SCHEMA_VERSION,
      projectFile: saved,
    },
  ]
  equal(
    chooseAutosaveRecord({ currentSessionId: "now", now: 30, records })
      .sessionId,
    "blank",
    "Recovery resurrects demo over newer blank"
  )
  equal(
    chooseAutosaveRecord({ currentSessionId: "blank", now: 30, records })
      .sessionId,
    "old",
    "Recovery selected its own session"
  )
  return {
    startup: "neutral",
    demo: "preserved",
    reset: "undo/redo",
    blank: "hydrated",
    recovery: "empty projects supported",
  }
}
