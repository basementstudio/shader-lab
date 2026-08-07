import type { AudioSpectrogram } from "@/lib/editor/audio/spectrogram"

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

export function collectSpectrogramTransfers(
  spectrogram: AudioSpectrogram
): ArrayBuffer[] {
  return [
    spectrogram.bands.buffer as ArrayBuffer,
    spectrogram.centerHz.buffer as ArrayBuffer,
    spectrogram.rms.buffer as ArrayBuffer,
  ]
}
