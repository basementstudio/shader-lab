interface GpuDiagnosticsCache {
  architecture?: string | undefined
  device?: string | undefined
  maxTextureDimension2D?: number | undefined
  vendor?: string | undefined
}

let cache: GpuDiagnosticsCache = {}
let deviceLost = false

// A type alias, not an interface: Sentry's `Context` is an index-signature type.
export type GpuSnapshot = {
  adapterAcquired: boolean
  architecture: string | undefined
  deviceLost: boolean
  gpuDevice: string | undefined
  maxTextureDimension2D: number | undefined
  supportsWebGPU: boolean
  vendor: string | undefined
}

export function recordDeviceDiagnostics(device: GPUDevice): void {
  const info: Partial<GPUAdapterInfo> = device.adapterInfo ?? {}

  cache = {
    architecture: info.architecture || undefined,
    device: info.device || undefined,
    maxTextureDimension2D: device.limits?.maxTextureDimension2D,
    vendor: info.vendor || undefined,
  }
}

export function markDeviceLost(): void {
  deviceLost = true
}

export function isDeviceLost(): boolean {
  return deviceLost
}

// Synchronous by design: diagnosing a stalled boot must not issue a second
// requestAdapter(), which would stall the same way and lose the report.
// `adapterAcquired: false` says the stall is upstream of device acquisition.
export function gpuSnapshot(): GpuSnapshot {
  return {
    adapterAcquired: cache.maxTextureDimension2D !== undefined,
    architecture: cache.architecture,
    deviceLost,
    gpuDevice: cache.device,
    maxTextureDimension2D: cache.maxTextureDimension2D,
    supportsWebGPU: typeof navigator !== "undefined" && "gpu" in navigator,
    vendor: cache.vendor,
  }
}
