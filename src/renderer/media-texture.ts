import * as THREE from "three/webgpu"

type VideoPlaybackMode = "export" | "live"

export interface VideoHandle {
  dispose: () => void
  prepareFrame: (time: number) => Promise<void>
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

export function loadImageTexture(url: string): Promise<THREE.Texture> {
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
      },
    )
  })
}

export function createVideoTexture(url: string): Promise<VideoHandle> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.loop = true
    video.muted = true
    video.playsInline = true
    let mode: VideoPlaybackMode = "live"
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
          await video.play()
        }

        resolve({
          dispose: () => {
            texture.dispose()
            video.pause()
            video.src = ""
          },
          async prepareFrame(time) {
            const duration = Number.isFinite(video.duration) ? video.duration : 0
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
      { once: true },
    )

    video.addEventListener(
      "loadedmetadata",
      () => {
        video.playbackRate = playbackRate
        video.play().catch(reject)
      },
      { once: true },
    )

    video.onerror = () => {
      reject(new Error(`Failed to load video texture: ${url}`))
    }

    video.src = url
    video.load()
  })
}
