"use client"

import type { VideoExportFormat } from "@/lib/editor/export"

type Mp4MuxerCodec = "avc" | "hevc"
type WebMMuxerCodec = "V_VP8" | "V_VP9"

export type SupportedVideoExportConfig = {
  encoderConfig: VideoEncoderConfig
  format: VideoExportFormat
  mimeType: "video/mp4" | "video/webm"
  muxerCodec: Mp4MuxerCodec | WebMMuxerCodec
}

export type AudioTrackConfig = {
  codec: "aac" | "opus"
  numberOfChannels: number
  sampleRate: number
}

type CreateVideoExportEncoderOptions = {
  audio?: AudioTrackConfig | null
  bitrate: number
  expectedAudioChunks?: number
  expectedVideoChunks?: number
  fileStream?: FileSystemWritableFileStream | null
  format: VideoExportFormat
  fps: number
  height: number
  width: number
}

type VideoExportEncoder = {
  addAudioChunk: (
    chunk: EncodedAudioChunk,
    meta?: EncodedAudioChunkMetadata
  ) => void
  close: () => void
  encodeCanvasFrame: (
    canvas: HTMLCanvasElement,
    frameIndex: number,
    duration: number,
    timestamp: number
  ) => Promise<void>
  finalize: () => Promise<Blob | null>
}

type VideoMuxer = {
  addAudioChunk: (
    chunk: EncodedAudioChunk,
    meta?: EncodedAudioChunkMetadata
  ) => void
  addVideoChunk: (
    chunk: EncodedVideoChunk,
    meta?: EncodedVideoChunkMetadata
  ) => void
  finalize: () => Promise<Blob | null>
}

const SUPPORT_PROBE_SIZE = {
  height: 720,
  width: 1280,
} as const

const WEBM_CODEC_CANDIDATES = [
  {
    codec: "vp09.00.10.08",
    muxerCodec: "V_VP9",
  },
  {
    codec: "vp8",
    muxerCodec: "V_VP8",
  },
] as const satisfies readonly {
  codec: string
  muxerCodec: WebMMuxerCodec
}[]

function getAvcLevelHex(width: number, height: number): string {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16)
  if (macroblocks <= 8192) return "28"
  if (macroblocks <= 8704) return "2A"
  if (macroblocks <= 22080) return "32"
  if (macroblocks <= 36864) return "33"
  return "3C"
}

function getMp4CodecCandidates(width: number, height: number): string[] {
  const level = getAvcLevelHex(width, height)
  return [`avc1.6400${level}`, `avc1.4d00${level}`, `avc1.42001E`]
}

const HEVC_MP4_CODEC_CANDIDATES = [
  "hvc1.1.6.L186.B0",
  "hev1.1.6.L186.B0",
  "hvc1.1.6.L123.00",
  "hev1.1.6.L123.00",
] as const

type HevcVideoEncoderConfig = VideoEncoderConfig & {
  hevc?: {
    format: "hevc" | "annexb"
  }
}

type EncoderProbeResult =
  | {
      encoder: VideoEncoder
      error: () => Error | null
    }
  | {
      encoder: null
      error: () => Error | null
    }

function getAppliedEncoderConfig(
  config: VideoEncoderConfig,
  options: CreateVideoExportEncoderOptions
): VideoEncoderConfig {
  return {
    ...config,
    bitrate: options.bitrate,
    framerate: options.fps,
    height: options.height,
    width: options.width,
  } as VideoEncoderConfig
}

async function resolveSupportedMp4Configs(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<SupportedVideoExportConfig[]> {
  const configs: SupportedVideoExportConfig[] = []

  if (
    typeof VideoEncoder === "undefined" ||
    typeof VideoFrame === "undefined"
  ) {
    return configs
  }

  for (const codec of HEVC_MP4_CODEC_CANDIDATES) {
    const support = await VideoEncoder.isConfigSupported({
      bitrate,
      codec,
      framerate: fps,
      height,
      width,
      hevc: {
        format: "hevc",
      },
    } as HevcVideoEncoderConfig).catch(() => null)

    if (!support?.config) {
      continue
    }

    configs.push({
      encoderConfig: support.config as VideoEncoderConfig,
      format: "mp4",
      mimeType: "video/mp4",
      muxerCodec: "hevc",
    })
  }

  for (const codec of getMp4CodecCandidates(width, height)) {
    const support = await VideoEncoder.isConfigSupported({
      avc: {
        format: "avc",
      },
      bitrate,
      codec,
      framerate: fps,
      height,
      width,
    }).catch(() => null)

    if (!support?.config) {
      continue
    }

    configs.push({
      encoderConfig: support.config,
      format: "mp4",
      mimeType: "video/mp4",
      muxerCodec: "avc",
    })
  }

  return configs
}

function createProbeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  return canvas
}

function createConfiguredEncoder(
  config: VideoEncoderConfig,
  output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void
): EncoderProbeResult {
  let encoderError: Error | null = null

  try {
    const encoder = new VideoEncoder({
      error(error) {
        encoderError = error
      },
      output(chunk, meta) {
        output(chunk, meta)
      },
    })

    encoder.configure(config)

    return {
      encoder,
      error: () => encoderError,
    }
  } catch (error) {
    encoderError = error instanceof Error ? error : new Error(String(error))

    return {
      encoder: null,
      error: () => encoderError,
    }
  }
}

async function probeEncoderConfig(
  config: VideoEncoderConfig,
  canvas: HTMLCanvasElement
): Promise<boolean> {
  const result = createConfiguredEncoder(config, () => undefined)

  if (!result.encoder) {
    return false
  }

  const frame = new VideoFrame(canvas, {
    duration: 1,
    timestamp: 0,
  })

  try {
    result.encoder.encode(frame, { keyFrame: true })
    await result.encoder.flush()
    return result.error() === null
  } catch {
    return false
  } finally {
    frame.close()

    if (result.encoder.state !== "closed") {
      result.encoder.close()
    }
  }
}

function getMp4RuntimeFailureMessage(
  options: CreateVideoExportEncoderOptions
): string {
  const sizeLabel = `${options.width}×${options.height}`
  return `MP4 export failed at ${sizeLabel}. Try 16:9, WebM, or a smaller height.`
}

async function resolveSupportedWebMConfig(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<SupportedVideoExportConfig | null> {
  if (
    typeof VideoEncoder === "undefined" ||
    typeof VideoFrame === "undefined"
  ) {
    return null
  }

  for (const candidate of WEBM_CODEC_CANDIDATES) {
    const support = await VideoEncoder.isConfigSupported({
      bitrate,
      codec: candidate.codec,
      framerate: fps,
      height,
      width,
    }).catch(() => null)

    if (!support?.config) {
      continue
    }

    return {
      encoderConfig: support.config,
      format: "webm",
      mimeType: "video/webm",
      muxerCodec: candidate.muxerCodec,
    }
  }

  return null
}

async function resolveSupportedMp4Config(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<SupportedVideoExportConfig | null> {
  const configs = await resolveSupportedMp4Configs(width, height, fps, bitrate)
  return configs[0] ?? null
}

export async function getSupportedVideoExportConfig(
  format: VideoExportFormat
): Promise<SupportedVideoExportConfig | null> {
  if (format === "mp4") {
    return resolveSupportedMp4Config(
      SUPPORT_PROBE_SIZE.width,
      SUPPORT_PROBE_SIZE.height,
      30,
      10_000_000
    )
  }

  return resolveSupportedWebMConfig(
    SUPPORT_PROBE_SIZE.width,
    SUPPORT_PROBE_SIZE.height,
    30,
    10_000_000
  )
}

async function createMuxer(
  support: SupportedVideoExportConfig,
  options: CreateVideoExportEncoderOptions
): Promise<VideoMuxer> {
  const stream = options.fileStream ?? null

  if (support.format === "mp4") {
    const {
      ArrayBufferTarget: Mp4ArrayBufferTarget,
      FileSystemWritableFileStreamTarget: Mp4FileTarget,
      Muxer: Mp4Muxer,
    } = await import("mp4-muxer")
    const memoryTarget = stream ? null : new Mp4ArrayBufferTarget()
    const muxer = new Mp4Muxer({
      ...(options.audio
        ? {
            audio: {
              codec: options.audio.codec,
              numberOfChannels: options.audio.numberOfChannels,
              sampleRate: options.audio.sampleRate,
            },
          }
        : {}),
      fastStart: stream
        ? {
            expectedAudioChunks: options.expectedAudioChunks ?? 0,
            expectedVideoChunks: options.expectedVideoChunks ?? 0,
          }
        : "in-memory",
      firstTimestampBehavior: "offset",
      target: stream ? new Mp4FileTarget(stream) : (memoryTarget as never),
      video: {
        codec: support.muxerCodec as Mp4MuxerCodec,
        frameRate: options.fps,
        height: options.height,
        width: options.width,
      },
    })

    return {
      addAudioChunk(chunk, meta) {
        muxer.addAudioChunk(chunk, meta)
      },
      addVideoChunk(chunk, meta) {
        muxer.addVideoChunk(chunk, meta)
      },
      async finalize() {
        muxer.finalize()

        if (memoryTarget) {
          return new Blob([memoryTarget.buffer], { type: support.mimeType })
        }

        await stream?.close()
        return null
      },
    }
  }

  const {
    ArrayBufferTarget: WebMArrayBufferTarget,
    FileSystemWritableFileStreamTarget: WebMFileTarget,
    Muxer: WebMMuxer,
  } = await import("webm-muxer")
  const memoryTarget = stream ? null : new WebMArrayBufferTarget()
  const muxer = new WebMMuxer({
    ...(options.audio
      ? {
          audio: {
            codec: "A_OPUS",
            numberOfChannels: options.audio.numberOfChannels,
            sampleRate: options.audio.sampleRate,
          },
        }
      : {}),
    firstTimestampBehavior: "offset",
    target: stream ? new WebMFileTarget(stream) : (memoryTarget as never),
    video: {
      codec: support.muxerCodec as WebMMuxerCodec,
      frameRate: options.fps,
      height: options.height,
      width: options.width,
    },
  })

  return {
    addAudioChunk(chunk, meta) {
      muxer.addAudioChunk(chunk, meta)
    },
    addVideoChunk(chunk, meta) {
      muxer.addVideoChunk(chunk, meta)
    },
    async finalize() {
      muxer.finalize()

      if (memoryTarget) {
        return new Blob([memoryTarget.buffer], { type: support.mimeType })
      }

      await stream?.close()
      return null
    },
  }
}

export async function createVideoExportEncoder(
  options: CreateVideoExportEncoderOptions
): Promise<VideoExportEncoder> {
  const supports =
    options.format === "mp4"
      ? await resolveSupportedMp4Configs(
          options.width,
          options.height,
          options.fps,
          options.bitrate
        )
      : [
          await resolveSupportedWebMConfig(
            options.width,
            options.height,
            options.fps,
            options.bitrate
          ),
        ].filter((value): value is SupportedVideoExportConfig => value !== null)

  if (supports.length === 0) {
    throw new Error(
      options.format === "mp4"
        ? "MP4 export is not supported in this browser."
        : "WebM export is not supported in this browser."
    )
  }

  let support: SupportedVideoExportConfig | null = null

  if (options.format === "mp4") {
    const probeCanvas = createProbeCanvas(options.width, options.height)

    for (const candidate of supports) {
      const config = getAppliedEncoderConfig(candidate.encoderConfig, options)

      if (await probeEncoderConfig(config, probeCanvas)) {
        support = candidate
        break
      }
    }

    if (!support) {
      throw new Error(getMp4RuntimeFailureMessage(options))
    }
  } else {
    support = supports[0] ?? null
  }

  if (!support) {
    throw new Error(
      options.format === "mp4"
        ? getMp4RuntimeFailureMessage(options)
        : "WebM export is not supported in this browser."
    )
  }

  let muxer: VideoMuxer | null = null
  let encoder: VideoEncoder | null = null
  let encoderError: Error | null = null
  let getEncoderError: (() => Error | null) | null = null

  for (const candidate of options.format === "mp4" ? supports : [support]) {
    const nextMuxer = await createMuxer(candidate, options)
    const result = createConfiguredEncoder(
      getAppliedEncoderConfig(candidate.encoderConfig, options),
      (chunk, meta) => {
        nextMuxer.addVideoChunk(chunk, meta)
      }
    )

    if (!result.encoder) {
      encoderError = result.error()
      continue
    }

    if (result.error()) {
      result.encoder.close()
      encoderError = result.error()
      continue
    }

    support = candidate
    muxer = nextMuxer
    encoder = result.encoder
    getEncoderError = result.error
    encoderError = getEncoderError()
    break
  }

  if (!(muxer && encoder)) {
    throw new Error(
      options.format === "mp4"
        ? getMp4RuntimeFailureMessage(options)
        : encoderError?.message ||
            "WebM export is not supported in this browser."
    )
  }

  return {
    addAudioChunk(chunk, meta) {
      muxer.addAudioChunk(chunk, meta)
    },

    close() {
      if (encoder.state !== "closed") {
        encoder.close()
      }
    },

    async encodeCanvasFrame(canvas, frameIndex, duration, timestamp) {
      encoderError = getEncoderError?.() ?? encoderError

      if (encoderError) {
        throw encoderError
      }

      const frame = new VideoFrame(canvas, {
        duration,
        timestamp,
      })

      try {
        encoder.encode(frame, {
          keyFrame: frameIndex % Math.max(1, options.fps) === 0,
        })
      } finally {
        frame.close()
      }

      if (frameIndex === 0 || encoder.encodeQueueSize > 2) {
        await encoder.flush()
      }

      encoderError = getEncoderError?.() ?? encoderError

      if (encoderError) {
        throw encoderError
      }
    },

    async finalize() {
      await encoder.flush()
      encoderError = getEncoderError?.() ?? encoderError

      if (encoderError) {
        throw encoderError
      }

      encoder.close()
      return muxer.finalize()
    },
  }
}
