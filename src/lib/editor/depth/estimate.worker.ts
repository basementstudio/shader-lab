/// <reference lib="webworker" />

import { env, pipeline, RawImage } from "@huggingface/transformers"
import {
  DEPTH_MODEL_ID,
  type DepthEstimationRequest,
  type DepthEstimationResponse,
} from "@/lib/editor/depth/depth-protocol"

const scope = self as unknown as DedicatedWorkerGlobalScope

type ProgressInfo = {
  file?: string
  loaded?: number
  progress?: number
  status: string
  total?: number
}

function post(message: DepthEstimationResponse): void {
  scope.postMessage(message)
}

async function pickDevice(): Promise<"wasm" | "webgpu"> {
  const gpu = (scope.navigator as Navigator & { gpu?: GPU }).gpu

  if (!gpu) {
    return "wasm"
  }

  try {
    const adapter = await gpu.requestAdapter()
    return adapter ? "webgpu" : "wasm"
  } catch {
    return "wasm"
  }
}

async function estimate(request: DepthEstimationRequest): Promise<void> {
  env.allowLocalModels = false
  const device = await pickDevice()
  const fileProgress = new Map<string, number>()

  post({ progress: 0, stage: "loading-model", type: "progress" })

  const estimator = await pipeline("depth-estimation", DEPTH_MODEL_ID, {
    device,
    dtype: device === "webgpu" ? "fp32" : "q8",
    progress_callback: (info: ProgressInfo) => {
      if (info.status !== "progress" || !info.file) {
        return
      }

      fileProgress.set(info.file, info.progress ?? 0)
      let sum = 0
      for (const value of fileProgress.values()) {
        sum += value
      }
      post({
        progress: Math.min(1, sum / (fileProgress.size * 100)),
        stage: "loading-model",
        type: "progress",
      })
    },
  })

  try {
    post({ progress: null, stage: "estimating", type: "progress" })
    const image = await RawImage.fromURL(request.url)
    const result = await estimator(image)
    const output = Array.isArray(result) ? result[0] : result

    if (!output) {
      throw new Error("The depth model returned no output.")
    }

    const grayscale = output.depth.grayscale()
    const depth =
      request.width > 0 && request.height > 0
        ? await grayscale.resize(request.width, request.height)
        : grayscale
    const blob = (await depth.toBlob("image/png")) as Blob

    post({ blob, device, type: "done" })
  } finally {
    await estimator.dispose()
  }
}

scope.onmessage = (event: MessageEvent<DepthEstimationRequest>) => {
  estimate(event.data).catch((error: unknown) => {
    post({
      message:
        error instanceof Error ? error.message : "Depth estimation failed.",
      type: "error",
    })
  })
}
