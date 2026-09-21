import {
  fitDocumentToViewport,
  getDocumentSize,
  normalizeCompositionForDocument,
  resolveCompositionUpdate,
} from "@/lib/editor/composition"
import { getBlankProjectFile } from "@/lib/editor/blank-project"
import {
  applyLabProjectFile,
  buildLabProjectFile,
  parseLabProjectFileValue,
} from "@/lib/editor/project-file"
import { createLayer } from "@/lib/editor/layers"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { DEFAULT_SCENE_CONFIG } from "@/types/editor"

function assert(value, label) {
  if (!value) throw new Error(label)
}
const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  )
const same = (a, b) => canonical(a) === canonical(b)

export async function checkArtboard() {
  let samples = 0
  const screen = { ...DEFAULT_SCENE_CONFIG, compositionAspect: "screen" }
  assert(getDocumentSize(screen, { width: 1920, height: 1080 }) === null, "Screen stays adaptive")
  assert(
    same(
      getDocumentSize(
        { compositionAspect: "custom", compositionWidth: 720, compositionHeight: 960 },
        { width: 1, height: 1 }
      ),
      { width: 720, height: 960 }
    ),
    "Custom document uses its own size"
  )
  assert(
    same(getDocumentSize({ ...screen, compositionAspect: "16:9", compositionWidth: 1000, compositionHeight: 1000 }, { width: 1000, height: 1000 }), { width: 1000, height: 563 }),
    "Preset with stale width/height crops the saved composition"
  )
  assert(
    same(getDocumentSize({ ...screen, compositionAspect: "16:9", compositionWidth: 1280, compositionHeight: 720 }, { width: 1000, height: 1000 }), { width: 1280, height: 720 }),
    "Preset with matching width/height is authoritative (undo-safe)"
  )
  assert(
    same(getDocumentSize({ ...screen, compositionAspect: "9:16", compositionWidth: 1920, compositionHeight: 1080 }, { width: 1000, height: 1000 }), { width: 563, height: 1000 }),
    "Portrait preset crops width"
  )
  assert(
    normalizeCompositionForDocument({ ...screen, compositionAspect: "16:9" }, { width: 1000, height: 1000 }).compositionHeight === 563,
    "Import normalizes preset width/height from the saved composition"
  )
  const fitted = fitDocumentToViewport({ width: 1920, height: 1080 }, { width: 1000, height: 800 })
  assert(fitted.width === 952 && Math.abs(fitted.height - 535.5) <= 0.5, `Fit keeps ratio with padding (${fitted.width}x${fitted.height})`)
  const tall = fitDocumentToViewport({ width: 720, height: 960 }, { width: 1440, height: 960 })
  assert(tall.height === 912 && tall.width === 684, `Fit is height-bound for portrait (${tall.width}x${tall.height})`)
  samples += 8

  let state = { sceneConfig: screen, outputSize: { width: 1920, height: 1080 } }
  const step = (updates) => {
    state = resolveCompositionUpdate(state.sceneConfig, state.outputSize, updates)
    return state
  }
  step({ aspect: "16:9" })
  assert(same(state.outputSize, { width: 1920, height: 1080 }) && state.sceneConfig.compositionWidth === 1920, "Screen to 16:9 keeps 1920x1080")
  step({ width: 960 })
  assert(same(state.outputSize, { width: 960, height: 540 }), "Width edit follows the preset ratio")
  step({ aspect: "custom" })
  assert(same(state.outputSize, { width: 960, height: 540 }), "Custom keeps the current size")
  step({ height: 700 })
  assert(same(state.outputSize, { width: 960, height: 700 }) && state.sceneConfig.compositionHeight === 700, "Custom edits are independent")
  step({ aspect: "1:1" })
  assert(same(state.outputSize, { width: 700, height: 700 }), "Square crops the custom document")
  step({ aspect: "screen" })
  assert(state.sceneConfig.compositionAspect === "screen" && same(state.outputSize, { width: 700, height: 700 }), "Screen keeps the last size for export")
  const undone = { ...state.sceneConfig, compositionAspect: "16:9", compositionWidth: 1920, compositionHeight: 1080 }
  assert(same(getDocumentSize(undone, state.outputSize), { width: 1920, height: 1080 }), "Restoring a scene config restores its artboard regardless of outputSize")
  samples += 7

  const editor = useEditorStore.getState()
  editor.updateSceneConfig(structuredClone(DEFAULT_SCENE_CONFIG))
  editor.setOutputSize(1920, 1080)
  editor.setComposition({ aspect: "custom", width: 720, height: 960 })
  assert(
    same(useEditorStore.getState().outputSize, { width: 720, height: 960 }) &&
      useEditorStore.getState().sceneConfig.compositionAspect === "custom",
    "Store composition update"
  )
  useLayerStore.getState().replaceState([createLayer("gradient")])
  const saved = buildLabProjectFile()
  assert(same(saved.composition, { width: 720, height: 960 }), "Saved composition is the document")
  editor.setComposition({ aspect: "16:9" })
  assert(same(buildLabProjectFile().composition, { width: 720, height: 405 }), "Aspect switch re-crops and saves")
  applyLabProjectFile(parseLabProjectFileValue(JSON.parse(JSON.stringify(saved))), [])
  {
    const { outputSize, sceneConfig } = useEditorStore.getState()
    assert(
      same(outputSize, { width: 720, height: 960 }) &&
        sceneConfig.compositionAspect === "custom" &&
        sceneConfig.compositionWidth === 720,
      `Reopen restores the fixed artboard (${JSON.stringify(outputSize)} ${sceneConfig.compositionAspect} ${sceneConfig.compositionWidth}x${sceneConfig.compositionHeight}; saved ${JSON.stringify(saved.composition)} ${saved.sceneConfig.compositionAspect})`
    )
  }
  const legacy = await (await fetch("/fixtures/existing-default-project.json")).json()
  applyLabProjectFile(parseLabProjectFileValue(legacy), [])
  assert(
    useEditorStore.getState().sceneConfig.compositionAspect === "screen" &&
      same(useEditorStore.getState().outputSize, legacy.composition) &&
      same(buildLabProjectFile().composition, legacy.composition),
    "Legacy adaptive projects keep their composition"
  )
  const blank = getBlankProjectFile()
  assert(
    blank.sceneConfig.compositionAspect === "16:9" &&
      same(getDocumentSize(blank.sceneConfig, blank.composition), { width: 1920, height: 1080 }),
    "New blank projects start on a fixed 16:9 artboard"
  )
  samples += 5
  return { samples }
}
