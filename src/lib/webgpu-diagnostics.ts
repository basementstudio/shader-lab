// A type alias, not an interface: Sentry's `Context` is an index-signature type.
export type GpuSnapshot = {
  adapterAcquired: boolean
  architecture: string | undefined
  gpuDevice: string | undefined
  maxTextureDimension2D: number | undefined
  supportsWebGPU: boolean
  vendor: string | undefined
}

type GpuFacts = Omit<GpuSnapshot, "adapterAcquired" | "supportsWebGPU">

const UNKNOWN: GpuFacts = {
  architecture: undefined,
  gpuDevice: undefined,
  maxTextureDimension2D: undefined,
  vendor: undefined,
}

let facts: GpuFacts | null = null

// First device wins: exports create their own renderer, and the preview's
// device is the one worth describing.
export function recordDeviceDiagnostics(device: GPUDevice): void {
  if (facts) {
    return
  }

  const info: Partial<GPUAdapterInfo> = device.adapterInfo ?? {}

  facts = {
    architecture: info.architecture || undefined,
    gpuDevice: info.device || undefined,
    maxTextureDimension2D: device.limits?.maxTextureDimension2D,
    vendor: info.vendor || undefined,
  }
}

// Synchronous by design: diagnosing a stalled boot must not issue a second
// requestAdapter(), which would stall the same way and lose the report.
// `adapterAcquired: false` says the stall is upstream of device acquisition.
export function gpuSnapshot(): GpuSnapshot {
  return {
    ...(facts ?? UNKNOWN),
    adapterAcquired: facts !== null,
    supportsWebGPU: typeof navigator !== "undefined" && "gpu" in navigator,
  }
}
