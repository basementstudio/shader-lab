import { getEffectiveTimelineDuration } from "@/lib/editor/timeline-duration"
import { useAssetStore } from "@/store/asset-store"
import { selectAudioModulationInput, useAudioStore } from "@/store/audio-store"
import { useEditorStore } from "@/store/editor-store"
import { useLayerStore } from "@/store/layer-store"
import { useTimelineStore } from "@/store/timeline-store"

const DEFAULT_MAX_WIDTH = 960

interface ScreenshotOptions {
  maxWidth?: number | undefined
  time?: number | undefined
}

function buildRenderProjectState() {
  const assets = useAssetStore.getState().assets
  const layers = useLayerStore.getState().layers
  const timelineState = useTimelineStore.getState()
  const editorState = useEditorStore.getState()
  const effectiveDuration = getEffectiveTimelineDuration(
    layers,
    assets,
    timelineState.duration
  )

  return {
    assets,
    // Without this an agent screenshot at time t would show static values while
    // the live canvas shows audio-driven ones — a silent disagreement.
    audio: selectAudioModulationInput(useAudioStore.getState()),
    compositionSize: editorState.outputSize,
    layers,
    sceneConfig: editorState.sceneConfig,
    timeline: {
      currentTime: timelineState.currentTime,
      duration: effectiveDuration,
      isPlaying: timelineState.isPlaying,
      loop: timelineState.loop,
      selectedKeyframeId: timelineState.selectedKeyframeId,
      selectedKeyframeIds: timelineState.selectedKeyframeIds,
      selectedTrackId: timelineState.selectedTrackId,
      tracks: structuredClone(timelineState.tracks),
    },
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : ""
      const base64 = dataUrl.split(",")[1]

      if (!base64) {
        reject(new Error("Could not encode the screenshot."))
        return
      }

      resolve(base64)
    }
    reader.onerror = () => {
      reject(new Error("Could not read the screenshot blob."))
    }
    reader.readAsDataURL(blob)
  })
}

export async function captureScreenshot(options: ScreenshotOptions): Promise<{
  base64: string
  height: number
  mimeType: string
  time: number
  width: number
}> {
  const { exportStillImage } = await import("@/lib/editor/export")
  const projectState = buildRenderProjectState()
  const composition = projectState.compositionSize
  const maxWidth = Math.max(
    64,
    Math.min(options.maxWidth ?? DEFAULT_MAX_WIDTH, composition.width)
  )
  const scale = maxWidth / Math.max(1, composition.width)
  const width = Math.max(1, Math.round(composition.width * scale))
  const height = Math.max(1, Math.round(composition.height * scale))
  const time = options.time ?? projectState.timeline.currentTime

  const blob = await exportStillImage(projectState, {
    aspectPreset: "original",
    height,
    qualityPreset: "draft",
    time,
    type: "image/png",
    width,
  })

  return {
    base64: await blobToBase64(blob),
    height,
    mimeType: "image/png",
    time,
    width,
  }
}
