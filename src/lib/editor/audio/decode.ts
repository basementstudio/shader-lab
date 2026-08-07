import { AUDIO_SAMPLE_RATE } from "@/lib/editor/audio/bands"
import { downmixToMono } from "@/lib/editor/audio/spectrogram"

export type DecodedAudio = {
  sampleRate: number
  samples: Float32Array
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Audio analysis aborted", "AbortError")
  }
}

export async function decodeAudioBuffer(
  url: string,
  signal?: AbortSignal
): Promise<AudioBuffer> {
  throwIfAborted(signal)

  const response = await fetch(url, signal ? { signal } : {})

  if (!response.ok) {
    throw new Error(`Failed to fetch audio (${response.status})`)
  }

  const encoded = await response.arrayBuffer()
  throwIfAborted(signal)

  const buffer = await decodeArrayBuffer(encoded)
  throwIfAborted(signal)

  return buffer
}

export async function decodeAudioToMono(
  url: string,
  signal?: AbortSignal
): Promise<DecodedAudio> {
  const buffer = await decodeAudioBuffer(url, signal)

  const channels: Float32Array[] = []
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    channels.push(buffer.getChannelData(channel))
  }

  return {
    sampleRate: buffer.sampleRate,
    samples: downmixToMono(channels),
  }
}

async function decodeArrayBuffer(encoded: ArrayBuffer): Promise<AudioBuffer> {
  const OfflineCtor =
    globalThis.OfflineAudioContext ??
    (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext

  if (OfflineCtor) {
    const context = new OfflineCtor(1, 1, AUDIO_SAMPLE_RATE)
    const retry = globalThis.AudioContext ? encoded.slice(0) : null

    try {
      return await context.decodeAudioData(encoded)
    } catch (error) {
      if (!retry) {
        throw error
      }

      return await decodeWithAudioContext(retry)
    }
  }

  if (!globalThis.AudioContext) {
    throw new Error("This browser cannot decode audio.")
  }

  return await decodeWithAudioContext(encoded)
}

function createDecodeAudioContext(): AudioContext {
  try {
    return new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE })
  } catch {
    return new AudioContext()
  }
}

async function decodeWithAudioContext(
  encoded: ArrayBuffer
): Promise<AudioBuffer> {
  const context = createDecodeAudioContext()

  try {
    return await context.decodeAudioData(encoded)
  } finally {
    void context.close()
  }
}
