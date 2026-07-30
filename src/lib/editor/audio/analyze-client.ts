import type {
  AnalysisRequest,
  AnalysisResponse,
} from "@/lib/editor/audio/analysis-protocol"
import { decodeAudioToMono } from "@/lib/editor/audio/decode"
import {
  analyzeSpectrogramStepwise,
  type AudioSpectrogram,
  type SpectrogramOptions,
} from "@/lib/editor/audio/spectrogram"

export type AnalyzeAudioOptions = SpectrogramOptions & {
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

/** How often the main-thread fallback yields to the event loop. */
const FALLBACK_YIELD_INTERVAL_MS = 8

function createAnalysisWorker(): Worker | null {
  if (typeof Worker === "undefined") {
    return null
  }

  try {
    return new Worker(new URL("./analysis.worker.ts", import.meta.url), {
      type: "module",
    })
  } catch {
    return null
  }
}

function runInWorker(
  worker: Worker,
  request: AnalysisRequest,
  options: AnalyzeAudioOptions
): Promise<AudioSpectrogram> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.onmessage = null
      worker.onerror = null
      options.signal?.removeEventListener("abort", onAbort)
      worker.terminate()
    }

    const onAbort = () => {
      cleanup()
      reject(new DOMException("Audio analysis aborted", "AbortError"))
    }

    worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      const message = event.data

      if (message.type === "progress") {
        options.onProgress?.(message.progress)
        return
      }

      if (message.type === "error") {
        cleanup()
        reject(new Error(message.message))
        return
      }

      cleanup()
      resolve(message.spectrogram)
    }

    worker.onerror = (event) => {
      cleanup()
      reject(new Error(event.message || "Audio analysis worker failed"))
    }

    options.signal?.addEventListener("abort", onAbort, { once: true })

    // Hand the PCM over rather than copying it — it can be ~57MB for a 5 minute
    // track, and the main thread has no further use for it.
    worker.postMessage(request, [request.samples.buffer as ArrayBuffer])
  })
}

/**
 * Main-thread stage A, yielding to the event loop periodically. Used when
 * Workers are unavailable (SSR, restrictive environments).
 */
async function runOnMainThread(
  request: AnalysisRequest,
  options: AnalyzeAudioOptions
): Promise<AudioSpectrogram> {
  const iterator = analyzeSpectrogramStepwise(
    request.samples,
    request.sampleRate,
    {
      ...(request.bandCount === undefined
        ? {}
        : { bandCount: request.bandCount }),
      ...(request.envelopeRate === undefined
        ? {}
        : { envelopeRate: request.envelopeRate }),
      ...(request.fftSize === undefined ? {} : { fftSize: request.fftSize }),
    }
  )

  let lastYield = performance.now()
  let step = iterator.next()

  while (!step.done) {
    options.onProgress?.(step.value)

    if (performance.now() - lastYield > FALLBACK_YIELD_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, 0))

      if (options.signal?.aborted) {
        throw new DOMException("Audio analysis aborted", "AbortError")
      }

      lastYield = performance.now()
    }

    step = iterator.next()
  }

  return step.value
}

/**
 * Decode an audio URL and produce its spectrogram (stage A).
 *
 * Decoding must happen on the main thread — Web Audio is not available inside a
 * Worker — so only the FFT pass is offloaded.
 */
export async function analyzeAudioSource(
  url: string,
  options: AnalyzeAudioOptions = {}
): Promise<AudioSpectrogram> {
  const decoded = await decodeAudioToMono(url, options.signal)

  const request: AnalysisRequest = {
    sampleRate: decoded.sampleRate,
    samples: decoded.samples,
    ...(options.bandCount === undefined ? {} : { bandCount: options.bandCount }),
    ...(options.envelopeRate === undefined
      ? {}
      : { envelopeRate: options.envelopeRate }),
    ...(options.fftSize === undefined ? {} : { fftSize: options.fftSize }),
  }

  const worker = createAnalysisWorker()

  if (!worker) {
    return runOnMainThread(request, options)
  }

  try {
    return await runInWorker(worker, request, options)
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error
    }

    // The buffer was transferred away, so the fallback cannot reuse it. Re-decode
    // rather than failing outright.
    const retry = await decodeAudioToMono(url, options.signal)

    return runOnMainThread(
      { ...request, samples: retry.samples, sampleRate: retry.sampleRate },
      options
    )
  }
}
