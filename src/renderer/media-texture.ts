import * as THREE from "three/webgpu"

type VideoPlaybackMode = "export" | "live"
const DEFAULT_SVG_RASTER_RESOLUTION = 2048

export interface ImageTextureSource {
  height?: number | null
  isSvg?: boolean
  svgRasterResolution?: number | null
  url: string
  width?: number | null
}

export interface VideoHandle {
  dispose: () => void
  prepareFrame: (time: number) => Promise<void>
  setFrozen: (frozen: boolean) => Promise<void>
  setLoop: (loop: boolean) => void
  setPlaybackMode: (mode: VideoPlaybackMode) => Promise<void>
  setPlaybackRate: (rate: number) => void
  texture: THREE.VideoTexture
  video: HTMLVideoElement
}

function clampPlaybackRate(rate: number): number {
  if (!Number.isFinite(rate)) {
    return 1
  }

  return Math.max(0.1, rate)
}

function normalizeVideoTime(
  time: number,
  duration: number,
  loop: boolean
): number {
  if (!(Number.isFinite(time) && Number.isFinite(duration) && duration > 0)) {
    return Math.max(0, time)
  }

  const safeEnd = Math.max(0, duration - 1 / 120)
  const sourceTime = Math.max(0, time)

  if (loop) {
    const remainder = sourceTime % duration
    return remainder >= 0 ? remainder : duration + remainder
  }

  return Math.min(sourceTime, safeEnd)
}

async function waitForSeek(video: HTMLVideoElement): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handleError = () => {
      cleanup()
      reject(new Error("Failed to decode the requested video frame."))
    }
    const handleSeeked = () => {
      cleanup()
      resolve()
    }
    const cleanup = () => {
      video.removeEventListener("error", handleError)
      video.removeEventListener("seeked", handleSeeked)
    }

    video.addEventListener("error", handleError, { once: true })
    video.addEventListener("seeked", handleSeeked, { once: true })
  })

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise<void>((resolve) => {
      const handleLoadedData = () => {
        cleanup()
        resolve()
      }
      const cleanup = () => {
        video.removeEventListener("loadeddata", handleLoadedData)
      }

      video.addEventListener("loadeddata", handleLoadedData, { once: true })
    })
  }

  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      resolve()
    })
  })
}

function loadRasterImageTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        resolve(texture)
      },
      undefined,
      () => {
        reject(new Error(`Failed to load image texture: ${url}`))
      }
    )
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }

      reject(new Error("Failed to encode SVG rasterization output."))
    }, "image/png")
  })
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = "async"
    image.onload = () => resolve(image)
    image.onerror = () => {
      reject(new Error(`Failed to load image texture: ${url}`))
    }
    image.src = url
  })
}

function resolveImageAspectRatio(
  source: ImageTextureSource,
  fallbackImage: HTMLImageElement
): number {
  const width = source.width ?? fallbackImage.naturalWidth
  const height = source.height ?? fallbackImage.naturalHeight

  if (width > 0 && height > 0) {
    return width / height
  }

  return 1
}

function resolveSvgRasterSize(
  aspectRatio: number,
  svgRasterResolution: number | null | undefined
): { height: number; width: number } {
  const longEdge = Math.max(
    1,
    Math.round(svgRasterResolution ?? DEFAULT_SVG_RASTER_RESOLUTION)
  )
  const safeAspectRatio = aspectRatio > 0 ? aspectRatio : 1

  if (safeAspectRatio >= 1) {
    return {
      height: Math.max(1, Math.round(longEdge / safeAspectRatio)),
      width: longEdge,
    }
  }

  return {
    height: longEdge,
    width: Math.max(1, Math.round(longEdge * safeAspectRatio)),
  }
}

async function loadSvgTexture(
  source: ImageTextureSource
): Promise<THREE.Texture> {
  const image = await loadImageElement(source.url)
  const aspectRatio = resolveImageAspectRatio(source, image)
  const { height, width } = resolveSvgRasterSize(
    aspectRatio,
    source.svgRasterResolution
  )
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Failed to rasterize SVG image.")
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const blob = await canvasToBlob(canvas)
  const blobUrl = URL.createObjectURL(blob)

  try {
    const texture = await loadRasterImageTexture(blobUrl)
    URL.revokeObjectURL(blobUrl)
    return texture
  } catch (error) {
    URL.revokeObjectURL(blobUrl)
    throw error
  }
}

export function loadImageTexture(
  source: string | ImageTextureSource
): Promise<THREE.Texture> {
  const resolvedSource = typeof source === "string" ? { url: source } : source

  if (resolvedSource.isSvg) {
    return loadSvgTexture(resolvedSource)
  }

  return loadRasterImageTexture(resolvedSource.url)
}

export function createVideoTexture(url: string): Promise<VideoHandle> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.loop = true
    video.muted = true
    video.playsInline = true
    let mode: VideoPlaybackMode = "live"
    let frozen = false
    let loop = true
    let playbackRate = 1

    video.addEventListener(
      "playing",
      () => {
        const texture = new THREE.VideoTexture(video)
        texture.colorSpace = THREE.SRGBColorSpace

        const setPlaybackMode = async (nextMode: VideoPlaybackMode) => {
          mode = nextMode

          if (nextMode === "export") {
            video.pause()
            video.loop = false
            return
          }

          video.loop = loop
          video.playbackRate = playbackRate

          if (frozen) {
            video.pause()
            return
          }

          await video.play()
        }

        resolve({
          dispose: () => {
            texture.dispose()
            video.pause()
            video.src = ""
          },
          async prepareFrame(time) {
            const duration = Number.isFinite(video.duration)
              ? video.duration
              : 0
            const targetTime = normalizeVideoTime(
              time * playbackRate,
              duration,
              loop
            )

            if (mode !== "export") {
              await setPlaybackMode("export")
            }

            if (Math.abs(video.currentTime - targetTime) <= 1 / 240) {
              return
            }

            video.currentTime = targetTime
            await waitForSeek(video)
          },
          async setFrozen(nextFrozen) {
            frozen = nextFrozen

            if (mode !== "live") {
              return
            }

            if (frozen) {
              video.pause()
              return
            }

            video.loop = loop
            video.playbackRate = playbackRate
            await video.play()
          },
          setLoop(nextLoop) {
            loop = nextLoop

            if (mode === "live") {
              video.loop = loop
            }
          },
          setPlaybackMode,
          setPlaybackRate(nextRate) {
            playbackRate = clampPlaybackRate(nextRate)

            if (mode === "live") {
              video.playbackRate = playbackRate
            }
          },
          texture,
          video,
        })
      },
      { once: true }
    )

    video.addEventListener(
      "loadedmetadata",
      () => {
        video.playbackRate = playbackRate
        video.play().catch(reject)
      },
      { once: true }
    )

    video.onerror = () => {
      reject(new Error(`Failed to load video texture: ${url}`))
    }

    video.src = url
    video.load()
  })
}
