import type {
  DepthEstimationRequest,
  DepthEstimationResponse,
  DepthEstimationStage,
} from "@/lib/editor/depth/depth-protocol"

export type DepthEstimationProgress = {
  progress: number | null
  stage: DepthEstimationStage
}

export type EstimateDepthOptions = DepthEstimationRequest & {
  onProgress?: (progress: DepthEstimationProgress) => void
  signal?: AbortSignal
}

export type EstimateDepthResult = {
  blob: Blob
  device: "wasm" | "webgpu"
}

export function describeDepthProgress(
  progress: DepthEstimationProgress
): string {
  if (progress.stage === "loading-model") {
    return progress.progress === null || progress.progress === 0
      ? "Loading depth model…"
      : `Downloading depth model ${Math.round(progress.progress * 100)}%`
  }

  return "Estimating depth…"
}

export function estimateDepthMap(
  options: EstimateDepthOptions
): Promise<EstimateDepthResult> {
  if (typeof Worker === "undefined") {
    return Promise.reject(
      new Error("Depth estimation needs a browser with Web Workers.")
    )
  }

  const worker = new Worker(
    new URL("./estimate.worker.ts", import.meta.url),
    { type: "module" }
  )

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.onmessage = null
      worker.onerror = null
      options.signal?.removeEventListener("abort", onAbort)
      worker.terminate()
    }

    const onAbort = () => {
      cleanup()
      reject(new DOMException("Depth estimation aborted", "AbortError"))
    }

    worker.onmessage = (event: MessageEvent<DepthEstimationResponse>) => {
      const message = event.data

      if (message.type === "progress") {
        options.onProgress?.({
          progress: message.progress,
          stage: message.stage,
        })
        return
      }

      if (message.type === "error") {
        cleanup()
        reject(new Error(message.message))
        return
      }

      cleanup()
      resolve({ blob: message.blob, device: message.device })
    }

    worker.onerror = (event) => {
      cleanup()
      reject(new Error(event.message || "Depth estimation worker failed."))
    }

    if (options.signal?.aborted) {
      onAbort()
      return
    }

    options.signal?.addEventListener("abort", onAbort, { once: true })
    worker.postMessage({
      height: options.height,
      url: options.url,
      width: options.width,
    } satisfies DepthEstimationRequest)
  })
}
