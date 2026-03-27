import * as THREE from "three/webgpu"

export interface VideoHandle {
  dispose: () => void
  texture: THREE.VideoTexture
  video: HTMLVideoElement
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

    video.addEventListener(
      "playing",
      () => {
        const texture = new THREE.VideoTexture(video)
        texture.colorSpace = THREE.SRGBColorSpace
        resolve({
          dispose: () => {
            texture.dispose()
            video.pause()
            video.src = ""
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
