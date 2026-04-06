"use client"

import {
  ArrayBufferTarget as Mp4ArrayBufferTarget,
  Muxer as Mp4Muxer,
} from "mp4-muxer"
import {
  ArrayBufferTarget as WebMArrayBufferTarget,
  Muxer as WebMMuxer,
} from "webm-muxer"
import type { VideoExportFormat } from "@/lib/editor/export"

type Mp4MuxerCodec = "avc"
type WebMMuxerCodec = "V_VP8" | "V_VP9"

export type SupportedVideoExportConfig = {
  encoderConfig: VideoEncoderConfig
  format: VideoExportFormat
  mimeType: "video/mp4" | "video/webm"
  muxerCodec: Mp4MuxerCodec | WebMMuxerCodec
}

type CreateVideoExportEncoderOptions = {
  bitrate: number
  format: VideoExportFormat
  fps: number
  height: number
  width: number
}

type VideoExportEncoder = {
  encodeCanvasFrame: (
    canvas: HTMLCanvasElement,
    frameIndex: number,
    duration: number,
    timestamp: number
  ) => Promise<void>
  finalize: () => Promise<Blob>
}

type VideoMuxer =
  | {
      addVideoChunk: (
        chunk: EncodedVideoChunk,
        meta?: EncodedVideoChunkMetadata
      ) => void
      finalize: () => Blob
    }
  | {
      addVideoChunk: (
        chunk: EncodedVideoChunk,
        meta?: EncodedVideoChunkMetadata
      ) => void
      finalize: () => Blob
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

const MP4_CODEC_CANDIDATES = [
  "avc1.640028",
  "avc1.4d0028",
  "avc1.42E01E",
] as const

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
  if (
    typeof VideoEncoder === "undefined" ||
    typeof VideoFrame === "undefined"
  ) {
    return null
  }

  for (const codec of MP4_CODEC_CANDIDATES) {
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

    return {
      encoderConfig: support.config,
      format: "mp4",
      mimeType: "video/mp4",
      muxerCodec: "avc",
    }
  }

  return null
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

function createMuxer(
  support: SupportedVideoExportConfig,
  options: CreateVideoExportEncoderOptions
): VideoMuxer {
  if (support.format === "mp4") {
    const target = new Mp4ArrayBufferTarget()
    const muxer = new Mp4Muxer({
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
      target,
      video: {
        codec: support.muxerCodec as Mp4MuxerCodec,
        frameRate: options.fps,
        height: options.height,
        width: options.width,
      },
    })

    return {
      addVideoChunk(chunk, meta) {
        muxer.addVideoChunk(chunk, meta)
      },
      finalize() {
        muxer.finalize()
        return new Blob([target.buffer], { type: support.mimeType })
      },
    }
  }

  const target = new WebMArrayBufferTarget()
  const muxer = new WebMMuxer({
    firstTimestampBehavior: "offset",
    target,
    video: {
      codec: support.muxerCodec as WebMMuxerCodec,
      frameRate: options.fps,
      height: options.height,
      width: options.width,
    },
  })

  return {
    addVideoChunk(chunk, meta) {
      muxer.addVideoChunk(chunk, meta)
    },
    finalize() {
      muxer.finalize()
      return new Blob([target.buffer], { type: support.mimeType })
    },
  }
}

export async function createVideoExportEncoder(
  options: CreateVideoExportEncoderOptions
): Promise<VideoExportEncoder> {
  const support = await (options.format === "mp4"
    ? resolveSupportedMp4Config(
        options.width,
        options.height,
        options.fps,
        options.bitrate
      )
    : resolveSupportedWebMConfig(
        options.width,
        options.height,
        options.fps,
        options.bitrate
      ))

  if (!support) {
    throw new Error(
      options.format === "mp4"
        ? "MP4 export is not supported in this browser."
        : "WebM export is not supported in this browser."
    )
  }

  const muxer = createMuxer(support, options)
  let encoderError: Error | null = null
  const encoder = new VideoEncoder({
    error(error) {
      encoderError = error
    },
    output(chunk, meta) {
      muxer.addVideoChunk(chunk, meta)
    },
  })

  encoder.configure({
    ...support.encoderConfig,
    bitrate: options.bitrate,
    framerate: options.fps,
    height: options.height,
    width: options.width,
  })

  return {
    async encodeCanvasFrame(canvas, frameIndex, duration, timestamp) {
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

      if (encoder.encodeQueueSize > 2) {
        await encoder.flush()
      }

      if (encoderError) {
        throw encoderError
      }
    },

    async finalize() {
      await encoder.flush()

      if (encoderError) {
        throw encoderError
      }

      encoder.close()
      return muxer.finalize()
    },
  }
}
