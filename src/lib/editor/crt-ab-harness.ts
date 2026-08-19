type Capture = {
  data: Uint8ClampedArray
  height: number
  width: number
}

type Comparison = {
  diffPixels: number
  height: number
  identical: boolean
  maxAbsDiff: number
  totalPixels: number
  width: number
}

const DEFAULT_TIMES = [0, 0.37, 1.5, 3.2]
const DEFAULT_MAX_WIDTH = 640

async function capturePixels(time: number, maxWidth: number): Promise<Capture> {
  const { captureScreenshot } = await import("@/lib/agent-bridge/screenshot")
  const shot = await captureScreenshot({ maxWidth, time })
  const blob = await (
    await fetch(`data:${shot.mimeType};base64,${shot.base64}`)
  ).blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const context = canvas.getContext("2d", { willReadFrequently: true })

  if (!context) {
    throw new Error("Could not acquire a 2d context for the A/B comparison.")
  }

  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  const image = context.getImageData(0, 0, canvas.width, canvas.height)

  return { data: image.data, height: canvas.height, width: canvas.width }
}

function compare(a: Capture, b: Capture): Comparison {
  if (a.width !== b.width || a.height !== b.height) {
    return {
      diffPixels: -1,
      height: a.height,
      identical: false,
      maxAbsDiff: -1,
      totalPixels: -1,
      width: a.width,
    }
  }

  let diffPixels = 0
  let maxAbsDiff = 0

  for (let index = 0; index < a.data.length; index += 4) {
    let pixelDiff = 0

    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(
        (a.data[index + channel] ?? 0) - (b.data[index + channel] ?? 0)
      )

      if (delta > pixelDiff) {
        pixelDiff = delta
      }
    }

    if (pixelDiff > 0) {
      diffPixels += 1

      if (pixelDiff > maxAbsDiff) {
        maxAbsDiff = pixelDiff
      }
    }
  }

  return {
    diffPixels,
    height: a.height,
    identical: diffPixels === 0,
    maxAbsDiff,
    totalPixels: a.data.length / 4,
    width: a.width,
  }
}


export async function runCrtDeterminismSelfTest(options?: {
  maxWidth?: number
  times?: number[]
}): Promise<Array<Comparison & { time: number }>> {
  const times = options?.times ?? DEFAULT_TIMES
  const maxWidth = options?.maxWidth ?? DEFAULT_MAX_WIDTH
  const results: Array<Comparison & { time: number }> = []

  for (const time of times) {
    const a = await capturePixels(time, maxWidth)
    const b = await capturePixels(time, maxWidth)
    results.push({ ...compare(a, b), time })
  }

  return results
}


export async function measureCrtGpu(options?: {
  crtVisible?: boolean
  iterations?: number
  warmup?: number
}): Promise<{ iterations: number; msPerRender: number; totalMs: number }> {
  const iterations = options?.iterations ?? 120
  const warmup = options?.warmup ?? 20

  const { useAssetStore } = await import("@/store/asset-store")
  const { selectAudioModulationInput, useAudioStore } = await import(
    "@/store/audio-store"
  )
  const { useEditorStore } = await import("@/store/editor-store")
  const { useLayerStore } = await import("@/store/layer-store")
  const { useTimelineStore } = await import("@/store/timeline-store")
  const { buildRendererFrame } = await import("@/renderer/contracts")
  const { acquirePreviewRenderLock } = await import(
    "@/lib/editor/preview-render-lock"
  )

  const editorState = useEditorStore.getState()
  const renderer = editorState.liveRenderer

  if (!renderer) {
    throw new Error("No live renderer is mounted.")
  }

  const allLayers = useLayerStore.getState().layers
  const layers =
    options?.crtVisible === false
      ? allLayers.map((layer) =>
          (layer as { type?: string }).type === "crt"
            ? { ...layer, visible: false }
            : layer
        )
      : allLayers

  const frame = buildRendererFrame({
    assets: useAssetStore.getState().assets,
    audio: selectAudioModulationInput(useAudioStore.getState()),
    clockTime: 2.5,
    delta: 1 / 60,
    layers,
    outputSize: editorState.outputSize,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    sceneConfig: editorState.sceneConfig,
    timeline: useTimelineStore.getState(),
    viewportSize: editorState.canvasSize,
  })

  const release = acquirePreviewRenderLock()

  try {
    for (let index = 0; index < warmup; index += 1) {
      renderer.render(frame)
    }
    await renderer.waitForGpuIdle()

    const started = performance.now()

    for (let index = 0; index < iterations; index += 1) {
      renderer.render(frame)
    }
    await renderer.waitForGpuIdle()

    const totalMs = performance.now() - started

    return {
      iterations,
      msPerRender: totalMs / iterations,
      totalMs,
    }
  } finally {
    release()
  }
}

export async function captureCrtModeMatrix(options?: {
  maxWidth?: number
  modes?: string[]
  times?: number[]
}): Promise<
  Array<{ base64: string; height: number; mode: string; time: number; width: number }>
> {
  const times = options?.times ?? DEFAULT_TIMES
  const maxWidth = options?.maxWidth ?? DEFAULT_MAX_WIDTH
  const modes = options?.modes ?? [
    "slot-mask",
    "aperture-grille",
    "composite-tv",
  ]

  const { captureScreenshot } = await import("@/lib/agent-bridge/screenshot")
  const { useLayerStore } = await import("@/store/layer-store")

  const store = useLayerStore.getState()
  const crtLayer = store.layers.find(
    (layer) => (layer as { type?: string }).type === "crt"
  )

  if (!crtLayer) {
    throw new Error("No CRT layer in the project.")
  }

  const layerId = (crtLayer as { id: string }).id
  const originalMode = (crtLayer as { params: Record<string, unknown> }).params
    .crtMode

  const results: Array<{
    base64: string
    height: number
    mode: string
    time: number
    width: number
  }> = []

  try {
    for (const mode of modes) {
      useLayerStore.getState().updateLayerParam(layerId, "crtMode", mode)

      for (const time of times) {
        const shot = await captureScreenshot({ maxWidth, time })
        results.push({
          base64: shot.base64,
          height: shot.height,
          mode,
          time,
          width: shot.width,
        })
      }
    }
  } finally {
    useLayerStore
      .getState()
      .updateLayerParam(
        layerId,
        "crtMode",
        originalMode as Parameters<typeof store.updateLayerParam>[2]
      )
  }

  return results
}

export async function sampleFps(durationMs = 2500): Promise<{
  frames: number
  meanFps: number
  meanFrameMs: number
  p50FrameMs: number
}> {
  const { useMetricsStore } = await import("@/store/metrics-store")
  const samples: number[] = []
  const started = performance.now()

  while (performance.now() - started < durationMs) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    const fps = useMetricsStore.getState().fps

    if (fps > 0) {
      samples.push(1000 / fps)
    }
  }

  const warm = samples.slice(Math.floor(samples.length * 0.2))
  const sorted = [...warm].sort((a, b) => a - b)
  const mean = warm.reduce((sum, value) => sum + value, 0) / (warm.length || 1)

  return {
    frames: warm.length,
    meanFps: 1000 / mean,
    meanFrameMs: mean,
    p50FrameMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
  }
}

export async function setCrtParam(
  key: string,
  value: unknown
): Promise<void> {
  const { useLayerStore } = await import("@/store/layer-store")
  const store = useLayerStore.getState()
  const crtLayer = store.layers.find(
    (layer) => (layer as { type?: string }).type === "crt"
  )

  if (!crtLayer) {
    throw new Error("No CRT layer in the project.")
  }

  store.updateLayerParam(
    (crtLayer as { id: string }).id,
    key,
    value as Parameters<typeof store.updateLayerParam>[2]
  )
}

export async function setCrtVisible(visible: boolean): Promise<void> {
  const { useLayerStore } = await import("@/store/layer-store")
  const store = useLayerStore.getState()
  const crtLayer = store.layers.find(
    (layer) => (layer as { type?: string }).type === "crt"
  )

  if (!crtLayer) {
    throw new Error("No CRT layer in the project.")
  }

  store.setLayerVisibility((crtLayer as { id: string }).id, visible)
}

export async function setPreviewRenderScale(scale: number): Promise<void> {
  const { useEditorStore } = await import("@/store/editor-store")
  useEditorStore
    .getState()
    .setRenderScale(
      scale as Parameters<
        ReturnType<typeof useEditorStore.getState>["setRenderScale"]
      >[0]
    )
}

export async function setCrtMode(mode: string): Promise<void> {
  const { useLayerStore } = await import("@/store/layer-store")
  const store = useLayerStore.getState()
  const crtLayer = store.layers.find(
    (layer) => (layer as { type?: string }).type === "crt"
  )

  if (!crtLayer) {
    throw new Error("No CRT layer in the project.")
  }

  store.updateLayerParam(
    (crtLayer as { id: string }).id,
    "crtMode",
    mode as Parameters<typeof store.updateLayerParam>[2]
  )
}

export async function probeBloomLayer(
  type: string
): Promise<{ base64: string; height: number; width: number }> {
  const { captureScreenshot } = await import("@/lib/agent-bridge/screenshot")
  const { useLayerStore } = await import("@/store/layer-store")

  const store = useLayerStore.getState()
  const id = store.addLayer(
    type as Parameters<typeof store.addLayer>[0]
  )
  useLayerStore.getState().updateLayerParam(id, "bloomEnabled", true)
  useLayerStore.getState().updateLayerParam(id, "bloomIntensity", 1.5)
  await new Promise((resolve) => setTimeout(resolve, 2500))

  try {
    const shot = await captureScreenshot({ maxWidth: 520, time: 1.5 })
    return { base64: shot.base64, height: shot.height, width: shot.width }
  } finally {
    useLayerStore.getState().removeLayers([id])
  }
}

export async function inspectCrtLayers(): Promise<unknown> {
  const { useEditorStore } = await import("@/store/editor-store")
  const { useLayerStore } = await import("@/store/layer-store")
  const { useTimelineStore } = await import("@/store/timeline-store")

  const layers = useLayerStore.getState().layers

  return {
    compositionSize: useEditorStore.getState().outputSize,
    crtLayers: layers
      .filter((layer) => (layer as { type?: string }).type === "crt")
      .map((layer) => ({
        id: (layer as { id?: string }).id,
        params: (layer as { params?: unknown }).params,
        visible: (layer as { visible?: boolean }).visible,
      })),
    layerKinds: layers.map((layer) => ({
      type: (layer as { type?: string }).type,
      visible: (layer as { visible?: boolean }).visible,
    })),
    timelineTime: useTimelineStore.getState().currentTime,
    trackBindings: useTimelineStore
      .getState()
      .tracks.map((track) => (track as { binding?: unknown }).binding),
  }
}

export function registerCrtAbHarness(): void {
  ;(
    window as unknown as {
      __CRT_AB__: {
        info: typeof inspectCrtLayers
        probeBloomLayer: typeof probeBloomLayer
        sampleFps: typeof sampleFps
        setCrtParam: typeof setCrtParam
        setCrtVisible: typeof setCrtVisible
        matrix: typeof captureCrtModeMatrix
        measure: typeof measureCrtGpu
        selfTest: typeof runCrtDeterminismSelfTest
        setCrtMode: typeof setCrtMode
        setScale: typeof setPreviewRenderScale
      }
    }
  ).__CRT_AB__ = {
    info: inspectCrtLayers,
    probeBloomLayer,
    sampleFps,
    setCrtParam,
    setCrtVisible,
    matrix: captureCrtModeMatrix,
    measure: measureCrtGpu,
    setCrtMode,
    setScale: setPreviewRenderScale,
    selfTest: runCrtDeterminismSelfTest,
  }
}
