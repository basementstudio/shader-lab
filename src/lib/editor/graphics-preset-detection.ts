import type { GraphicsPreset } from "@/lib/editor/graphics-preset"

interface AdapterSignal {
  vendor: string
  architecture: string
  isFallback: boolean
}

async function probeAdapter(): Promise<AdapterSignal | null> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    return null
  }

  try {
    const adapter = await navigator.gpu.requestAdapter()

    if (!adapter) {
      return null
    }

    const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info
    const isFallback =
      (adapter as GPUAdapter & { isFallbackAdapter?: boolean })
        .isFallbackAdapter ?? false
    return {
      vendor: (info?.vendor ?? "").toLowerCase(),
      architecture: (info?.architecture ?? "").toLowerCase(),
      isFallback,
    }
  } catch {
    return null
  }
}

function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") {
    return false
  }
  return /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent)
}

function presetFromHardwareConcurrency(): GraphicsPreset {
  if (typeof navigator === "undefined") {
    return "balanced"
  }
  const cores = navigator.hardwareConcurrency ?? 4
  if (cores >= 8) return "quality"
  if (cores >= 4) return "balanced"
  return "performance"
}

export async function detectInitialPreset(): Promise<GraphicsPreset> {
  const adapter = await probeAdapter()

  if (adapter?.isFallback) {
    return "performance"
  }

  if (isMobileUserAgent()) {
    return "balanced"
  }

  if (adapter) {
    const { vendor, architecture } = adapter

    if (vendor === "apple") {
      return "quality"
    }

    if (vendor === "nvidia" || vendor === "amd") {
      return "quality"
    }

    if (vendor === "intel") {
      const isModernIntel = /arc|iris|xe/.test(architecture)
      return isModernIntel ? "balanced" : "performance"
    }
  }

  return presetFromHardwareConcurrency()
}

function downgrade(preset: GraphicsPreset): GraphicsPreset {
  if (preset === "quality") return "balanced"
  if (preset === "balanced") return "performance"
  return "performance"
}

/**
 * Reads stable FPS after a warm-up window and downgrades the preset if FPS is
 * below an acceptable threshold. Returns the (possibly downgraded) preset.
 */
export function adjustPresetFromFps(
  current: GraphicsPreset,
  medianFps: number
): GraphicsPreset {
  if (!Number.isFinite(medianFps) || medianFps <= 0) {
    return current
  }
  if (medianFps < 45) {
    return downgrade(current)
  }
  return current
}

export interface FpsProbeOptions {
  getFps: () => number
  warmupMs?: number
  sampleMs?: number
  signal?: AbortSignal
}

/**
 * Samples FPS after a warm-up (to let shader compilation settle) and returns
 * the median of the sampled values. Reads from the existing metrics-store FPS
 * signal; no new telemetry is introduced.
 */
export async function sampleMedianFps({
  getFps,
  warmupMs = 500,
  sampleMs = 1000,
  signal,
}: FpsProbeOptions): Promise<number> {
  await wait(warmupMs, signal)

  const samples: number[] = []
  const sampleInterval = 50
  let elapsed = 0

  while (elapsed < sampleMs) {
    if (signal?.aborted) {
      break
    }
    const fps = getFps()
    if (fps > 0 && Number.isFinite(fps)) {
      samples.push(fps)
    }
    await wait(sampleInterval, signal)
    elapsed += sampleInterval
  }

  if (samples.length === 0) {
    return 0
  }

  samples.sort((a, b) => a - b)
  const mid = Math.floor(samples.length / 2)
  if (samples.length % 2 === 0) {
    return ((samples[mid - 1] ?? 0) + (samples[mid] ?? 0)) / 2
  }
  return samples[mid] ?? 0
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timer = window.setTimeout(() => {
      resolve()
    }, ms)
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
    void reject
  })
}
