import { AUDIO_SAMPLE_RATE } from "@/lib/editor/audio/bands"

export const EXPORT_AUDIO_SAMPLE_RATE = AUDIO_SAMPLE_RATE
export const EXPORT_AUDIO_CHANNELS = 2
export const MAX_EXPORT_AUDIO_SEGMENTS = 512

const ENCODE_BLOCK_FRAMES = 1024
const MAX_QUEUED_BLOCKS = 32

type DequeueCapableEncoder = AudioEncoder & {
  ondequeue?: (() => void) | null
}

function drainEncodeQueue(encoder: AudioEncoder): Promise<void> {
  if (encoder.encodeQueueSize <= MAX_QUEUED_BLOCKS) {
    return Promise.resolve()
  }

  const dequeueCapable = encoder as DequeueCapableEncoder

  if (!("ondequeue" in dequeueCapable)) {
    return new Promise<void>((resolve) => {
      const poll = () => {
        if (encoder.encodeQueueSize <= MAX_QUEUED_BLOCKS) {
          resolve()
          return
        }

        setTimeout(poll, 4)
      }

      poll()
    })
  }

  return new Promise<void>((resolve) => {
    const onDequeue = () => {
      if (encoder.encodeQueueSize > MAX_QUEUED_BLOCKS) {
        return
      }

      dequeueCapable.ondequeue = null
      resolve()
    }

    dequeueCapable.ondequeue = onDequeue
  })
}

const AAC_LC_ENCODER_PRIMING_FRAMES = 2048
const OPUS_PRESKIP_HANDLED_BY_MUXER = 0

export function getEncoderPrimingSeconds(codec: "aac" | "opus"): number {
  const frames =
    codec === "aac"
      ? AAC_LC_ENCODER_PRIMING_FRAMES
      : OPUS_PRESKIP_HANDLED_BY_MUXER

  return frames / EXPORT_AUDIO_SAMPLE_RATE
}

export type ExportAudioSegment = {
  durationSeconds: number
  outputStartSeconds: number
  sourceStartSeconds: number
}

export type PlanExportAudioInput = {
  durationSeconds: number
  loop: boolean
  offsetSeconds: number
  sourceDurationSeconds: number
  startSeconds: number
  timelineDurationSeconds: number
}

function clampToTimeline(time: number, timelineDuration: number): number {
  return Math.min(Math.max(time, 0), timelineDuration)
}

function clipToSource(
  segment: ExportAudioSegment,
  sourceDurationSeconds: number
): ExportAudioSegment | null {
  let { durationSeconds, outputStartSeconds, sourceStartSeconds } = segment

  if (sourceStartSeconds < 0) {
    const skipped = Math.min(-sourceStartSeconds, durationSeconds)
    outputStartSeconds += skipped
    sourceStartSeconds += skipped
    durationSeconds -= skipped
  }

  if (sourceStartSeconds >= sourceDurationSeconds) {
    return null
  }

  durationSeconds = Math.min(
    durationSeconds,
    sourceDurationSeconds - sourceStartSeconds
  )

  if (durationSeconds <= 0) {
    return null
  }

  return { durationSeconds, outputStartSeconds, sourceStartSeconds }
}

export function planExportAudioSegments(
  input: PlanExportAudioInput
): ExportAudioSegment[] {
  const {
    durationSeconds,
    loop,
    offsetSeconds,
    sourceDurationSeconds,
    startSeconds,
    timelineDurationSeconds,
  } = input

  if (
    !(
      durationSeconds > 0 &&
      sourceDurationSeconds > 0 &&
      timelineDurationSeconds > 0
    )
  ) {
    return []
  }

  const segments: ExportAudioSegment[] = []

  if (!loop) {
    const from = clampToTimeline(startSeconds, timelineDurationSeconds)
    const to = clampToTimeline(
      startSeconds + durationSeconds,
      timelineDurationSeconds
    )

    const clipped = clipToSource(
      {
        durationSeconds: to - from,
        outputStartSeconds: Math.max(0, -startSeconds),
        sourceStartSeconds: from + offsetSeconds,
      },
      sourceDurationSeconds
    )

    return clipped ? [clipped] : []
  }

  const endSeconds = startSeconds + durationSeconds
  let cursor = startSeconds

  while (cursor < endSeconds) {
    if (segments.length >= MAX_EXPORT_AUDIO_SEGMENTS) {
      throw new Error(
        `Looping audio across more than ${MAX_EXPORT_AUDIO_SEGMENTS} passes is not supported. Raise the timeline duration or turn off loop.`
      )
    }

    const position =
      ((cursor % timelineDurationSeconds) + timelineDurationSeconds) %
      timelineDurationSeconds
    const runLength = Math.min(
      timelineDurationSeconds - position,
      endSeconds - cursor
    )

    const clipped = clipToSource(
      {
        durationSeconds: runLength,
        outputStartSeconds: cursor - startSeconds,
        sourceStartSeconds: position + offsetSeconds,
      },
      sourceDurationSeconds
    )

    if (clipped) {
      segments.push(clipped)
    }

    cursor += runLength
  }

  return segments
}

export async function renderExportAudio(
  source: AudioBuffer,
  segments: readonly ExportAudioSegment[],
  totalDurationSeconds: number
): Promise<AudioBuffer> {
  const frames = Math.max(
    1,
    Math.round(totalDurationSeconds * EXPORT_AUDIO_SAMPLE_RATE)
  )
  const context = new OfflineAudioContext(
    EXPORT_AUDIO_CHANNELS,
    frames,
    EXPORT_AUDIO_SAMPLE_RATE
  )

  for (const segment of segments) {
    const node = context.createBufferSource()
    node.buffer = source
    node.connect(context.destination)
    node.start(
      segment.outputStartSeconds,
      segment.sourceStartSeconds,
      segment.durationSeconds
    )
  }

  return await context.startRendering()
}

export type ExportAudioTrackConfig = {
  codec: "aac" | "opus"
  encoderConfig: AudioEncoderConfig
  numberOfChannels: number
  sampleRate: number
}

const AAC_CODEC_CANDIDATES = ["mp4a.40.2", "mp4a.40.5"] as const
const OPUS_CODEC_CANDIDATES = ["opus"] as const

export async function resolveExportAudioConfig(
  format: "mp4" | "webm",
  bitrate = 192_000
): Promise<ExportAudioTrackConfig | null> {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") {
    return null
  }

  const codec = format === "mp4" ? "aac" : "opus"
  const candidates = format === "mp4" ? AAC_CODEC_CANDIDATES : OPUS_CODEC_CANDIDATES

  for (const candidate of candidates) {
    const config: AudioEncoderConfig = {
      bitrate,
      codec: candidate,
      numberOfChannels: EXPORT_AUDIO_CHANNELS,
      sampleRate: EXPORT_AUDIO_SAMPLE_RATE,
    }

    const support = await AudioEncoder.isConfigSupported(config).catch(
      () => null
    )

    if (support?.supported && support.config) {
      return {
        codec,
        encoderConfig: support.config,
        numberOfChannels: EXPORT_AUDIO_CHANNELS,
        sampleRate: EXPORT_AUDIO_SAMPLE_RATE,
      }
    }
  }

  return null
}

function planarBlock(
  buffer: AudioBuffer,
  offset: number,
  frames: number
): Float32Array<ArrayBuffer> {
  const block = new Float32Array(
    new ArrayBuffer(frames * EXPORT_AUDIO_CHANNELS * 4)
  )

  for (let channel = 0; channel < EXPORT_AUDIO_CHANNELS; channel += 1) {
    const source = buffer.getChannelData(
      Math.min(channel, buffer.numberOfChannels - 1)
    )
    block.set(source.subarray(offset, offset + frames), channel * frames)
  }

  return block
}

export type EncodeExportAudioOptions = {
  addChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void
  buffer: AudioBuffer
  config: ExportAudioTrackConfig
  onProgress?: (value: number) => void
  signal?: AbortSignal
}

export async function encodeExportAudio({
  addChunk,
  buffer,
  config,
  onProgress,
  signal,
}: EncodeExportAudioOptions): Promise<void> {
  let encoderError: Error | null = null

  const encoder = new AudioEncoder({
    error(error) {
      encoderError = error
    },
    output(chunk, meta) {
      addChunk(chunk, meta)
    },
  })

  encoder.configure(config.encoderConfig)

  try {
    const totalFrames = buffer.length

    for (let offset = 0; offset < totalFrames; offset += ENCODE_BLOCK_FRAMES) {
      if (signal?.aborted) {
        throw new DOMException("Video export cancelled.", "AbortError")
      }

      if (encoderError) {
        throw encoderError
      }

      const frames = Math.min(ENCODE_BLOCK_FRAMES, totalFrames - offset)
      const data = new AudioData({
        data: planarBlock(buffer, offset, frames),
        format: "f32-planar",
        numberOfChannels: EXPORT_AUDIO_CHANNELS,
        numberOfFrames: frames,
        sampleRate: config.sampleRate,
        timestamp: Math.round((offset / config.sampleRate) * 1_000_000),
      })

      try {
        encoder.encode(data)
      } finally {
        data.close()
      }

      await drainEncodeQueue(encoder)

      onProgress?.(Math.min(1, (offset + frames) / totalFrames))
    }

    await encoder.flush()

    if (encoderError) {
      throw encoderError
    }
  } finally {
    if (encoder.state !== "closed") {
      encoder.close()
    }
  }
}
