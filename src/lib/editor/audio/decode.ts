import { downmixToMono } from "@/lib/editor/audio/spectrogram"

/**
 * The only module in `lib/editor/audio` permitted to touch Web Audio.
 *
 * Everything else is pure so the analysis pipeline stays unit-testable under
 * `bun test` and runnable inside a Worker. Keep it that way.
 */

export type DecodedAudio = {
  sampleRate: number
  samples: Float32Array
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Audio analysis aborted", "AbortError")
  }
}

/**
 * Decode any browser-supported audio container to mono PCM.
 *
 * Uses `OfflineAudioContext` rather than a live `AudioContext`: it has no
 * autoplay-policy user-gesture requirement and nothing to leak. This also
 * transparently handles the audio track of an mp4/webm, which is what makes
 * "use a video layer's audio" the same code path with no extra work.
 */
export async function decodeAudioToMono(
  url: string,
  signal?: AbortSignal
): Promise<DecodedAudio> {
  throwIfAborted(signal)

  const response = await fetch(url, signal ? { signal } : {})

  if (!response.ok) {
    throw new Error(`Failed to fetch audio (${response.status})`)
  }

  const encoded = await response.arrayBuffer()
  throwIfAborted(signal)

  const buffer = await decodeArrayBuffer(encoded)
  throwIfAborted(signal)

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
  // Sample rate and length here are placeholders — decodeAudioData returns the
  // file's own rate regardless.
  const OfflineCtor =
    globalThis.OfflineAudioContext ??
    (globalThis as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext

  if (OfflineCtor) {
    const context = new OfflineCtor(1, 1, 44100)

    try {
      return await context.decodeAudioData(encoded)
    } catch (error) {
      // Some Safari versions reject OfflineAudioContext.decodeAudioData for
      // certain containers; fall through to a real context below.
      if (!globalThis.AudioContext) {
        throw error
      }
    }
  }

  if (!globalThis.AudioContext) {
    throw new Error("This browser cannot decode audio.")
  }

  const context = new AudioContext()

  try {
    return await context.decodeAudioData(encoded)
  } finally {
    void context.close()
  }
}
