import type { AudioSpectrogram } from "@/lib/editor/audio/spectrogram"

/**
 * Message shapes shared between the main thread and the analysis Worker.
 *
 * Kept in its own module so the Worker entry point imports no React, no stores
 * and no DOM helpers — importing any of those would break the Worker bundle.
 */

export type AnalysisRequest = {
  bandCount?: number
  envelopeRate?: number
  fftSize?: number
  sampleRate: number
  samples: Float32Array
}

export type AnalysisResponse =
  | { message: string; type: "error" }
  | { progress: number; type: "progress" }
  | { spectrogram: AudioSpectrogram; type: "done" }

/** Buffers to hand over rather than copy when posting a finished spectrogram. */
export function collectSpectrogramTransfers(
  spectrogram: AudioSpectrogram
): ArrayBuffer[] {
  return [
    spectrogram.bands.buffer as ArrayBuffer,
    spectrogram.centerHz.buffer as ArrayBuffer,
    spectrogram.rms.buffer as ArrayBuffer,
  ]
}
