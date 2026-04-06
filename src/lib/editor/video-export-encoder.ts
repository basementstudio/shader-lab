"use client"

import { ArrayBufferTarget, Muxer } from "webm-muxer"

export type SupportedVideoExportConfig = {
  encoderConfig: VideoEncoderConfig
  format: "webm"
  mimeType: "video/webm"
  muxerCodec: "V_VP8" | "V_VP9"
}

type CreateVideoExportEncoderOptions = {
  bitrate: number
  format: "mp4" | "webm"
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
  muxerCodec: "V_VP8" | "V_VP9"
}[]

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

    if (!support) {
      continue
    }

    if (!support.config) {
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

export async function getSupportedVideoExportConfig(
  format: "mp4" | "webm"
): Promise<SupportedVideoExportConfig | null> {
  if (format === "mp4") {
    return null
  }

  return resolveSupportedWebMConfig(
    SUPPORT_PROBE_SIZE.width,
    SUPPORT_PROBE_SIZE.height,
    30,
    10_000_000
  )
}

export async function createVideoExportEncoder(
  options: CreateVideoExportEncoderOptions
): Promise<VideoExportEncoder> {
  const support = await (options.format === "webm"
    ? resolveSupportedWebMConfig(
        options.width,
        options.height,
        options.fps,
        options.bitrate
      )
    : Promise.resolve(null))

  if (!support) {
    throw new Error(
      options.format === "mp4"
        ? "MP4 export is not available in this browser yet."
        : "WebM export is not supported in this browser."
    )
  }

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    firstTimestampBehavior: "offset",
    target,
    video: {
      codec: support.muxerCodec,
      frameRate: options.fps,
      height: options.height,
      width: options.width,
    },
  })

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

      muxer.finalize()
      encoder.close()

      return new Blob([target.buffer], { type: support.mimeType })
    },
  }
}
