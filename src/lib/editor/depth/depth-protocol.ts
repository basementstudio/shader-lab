export const DEPTH_MODEL_ID = "onnx-community/depth-anything-v2-small"

export type DepthEstimationRequest = {
  height: number
  url: string
  width: number
}

export type DepthEstimationStage = "loading-model" | "estimating"

export type DepthEstimationResponse =
  | { message: string; type: "error" }
  | { progress: number | null; stage: DepthEstimationStage; type: "progress" }
  | { blob: Blob; device: "wasm" | "webgpu"; type: "done" }
