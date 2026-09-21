// Bounded, opt-in pass benchmark. Software-adapter numbers are not native FPS.
import { BlobTrackingPass } from "@/renderer/blob-tracking-pass"
import {
  emptyCellPaintMask,
  encodeCellPaintMask,
} from "@/renderer/cell-paint-mask"
import { paintCellSegment } from "@/lib/editor/paint/cell-paint-brush"
import * as THREE from "three/webgpu"
import { DisplacedRingsPass } from "@/renderer/displaced-rings-pass"
import { PhotographicCellsPass } from "@/renderer/photographic-cells-pass"
window.run = async ({ scatterOnly = false, blobOnly = false } = {}) => {
  const renderer = new THREE.WebGPURenderer({ antialias: false })
  await renderer.init()
  renderer.toneMapping = THREE.NoToneMapping
  const video = document.createElement("video")
  video.src = "/aura.mp4"
  video.muted = true
  video.loop = true
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve
    video.onerror = reject
  })
  await video.play()
  const videoCanvas = document.createElement("canvas")
  videoCanvas.width = video.videoWidth
  videoCanvas.height = video.videoHeight
  const context = videoCanvas.getContext("2d")
  const input = new THREE.CanvasTexture(videoCanvas)
  const rings = new DisplacedRingsPass("rings")
  rings.updateCompositionRole("transform")
  rings.flushColorNode()
  rings.updateParams({
    shape: "half-discs",
    count: 22,
    radius: 2,
    rotationStep: 45,
    offset: [0, 0],
    gap: 0,
  })
  const intermediate = new THREE.RenderTarget(640, 480, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
  })
  const pass = new PhotographicCellsPass("perf")
  pass.updateCompositionRole("transform")
  pass.flushColorNode()
  const target = new THREE.RenderTarget(640, 480, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
  })
  const blob = new BlobTrackingPass("blob")
  blob.updateCompositionRole("effect")
  blob.flushColorNode()
  const adapter = await navigator.gpu.requestAdapter()
  const results = []
  const mask = emptyCellPaintMask(2, 1)
  paintCellSegment(mask, { x: -0.7, y: -0.2 }, { x: 0.5, y: 0.2 }, 0.2, false)
  const paintMask = encodeCellPaintMask(mask)
  try {
    for (const [width, height] of [
      [640, 480],
      [1920, 1080],
    ]) {
      target.setSize(width, height)
      intermediate.setSize(width, height)
      pass.resize(width, height)
      pass.updateLogicalSize(width, height)
      rings.resize(width, height)
      rings.updateLogicalSize(width, height)
      blob.resize(width, height)
      blob.updateLogicalSize(width, height)
      const scenarios = blobOnly
        ? ["blob-outline", "blob-brackets-dots-labels"]
        : null
      for (const scenario of scenarios ??
        (scatterOnly
        ? [
            "cells-random",
            "cells-random-scatter",
            "cells-light",
            "cells-light-scatter",
            "cells-paint",
            "cells-paint-scatter",
          ]
        : [
            "rings",
            "cells-random",
            "cells-light",
            "cells-paint",
            "combined",
            "combined-paint",
          ])) {
        if (scenario.startsWith("blob")) {
          blob.updateParams({
            detectionMode: "luminance",
            sensitivity: 0.7,
            blobAmount: 12,
            minBlobSize: 2,
            persistentTracking: true,
            smoothing: 0.6,
            frameStyle: scenario.includes("brackets") ? "brackets" : "outline",
            edgeDots: scenario.includes("dots") ? 1 : 0,
            dotSize: 2,
            showLabels: true,
            labelMode: scenario.includes("labels") ? "id" : "coordinates",
            labelPrefix: "PERSON",
            connectLines: true,
            centerShape: "dot",
            trailDecay: 0.35,
          })
        }
        const selection = scenario.startsWith("cells-light")
          ? "light"
          : "random"
        pass.updateParams({
          mode: scenario.includes("paint") ? "paint" : "regions",
          paintMask,
          selection,
          edgeScatter: scenario.endsWith("-scatter") ? 0.65 : 0,
          regionSize: 0.35,
          size: 0.04,
          threshold: 0.5,
          gap: 0,
          outlineMode: "perimeter",
          outline: 0.025,
          outlineColor: "#b53387",
          irregularity: 0,
        })
        const times = []
        for (let frame = 0; frame < 7; frame++) {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error("Video frame timed out")),
              8000
            )
            video.requestVideoFrameCallback(() => {
              clearTimeout(timeout)
              resolve()
            })
          })
          const start = performance.now()
          context.drawImage(video, 0, 0)
          input.needsUpdate = true
          if (scenario.startsWith("blob")) {
            blob.render(renderer, input, target, frame / 30, 1 / 30, frame / 30)
          } else if (scenario === "rings")
            rings.render(renderer, input, target, frame / 30, 1 / 30)
          else if (scenario.startsWith("combined")) {
            rings.render(renderer, input, intermediate, frame / 30, 1 / 30)
            pass.render(
              renderer,
              intermediate.texture,
              target,
              frame / 30,
              1 / 30
            )
          } else pass.render(renderer, input, target, frame / 30, 1 / 30)
          await renderer.backend.device.queue.onSubmittedWorkDone()
          if (frame > 1) times.push(performance.now() - start)
        }
        times.sort((a, b) => a - b)
        results.push({
          width,
          height,
          scenario,
          medianMs: times[2],
          maxMs: times.at(-1),
        })
      }
    }
    return {
      source: {
        file: "aura.mp4",
        width: video.videoWidth,
        height: video.videoHeight,
        upload: "CanvasTexture (decoded video frame)",
      },
      timing:
        "2 warm-up + 5 timed frames; upload, pass submission, queue completion; no frame-wait time",
      adapter: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        description: adapter.info.description,
      },
      results,
    }
  } finally {
    video.pause()
    rings.dispose()
    intermediate.dispose()
    pass.dispose()
    target.dispose()
    input.dispose()
    renderer.dispose()
    renderer.backend.device.destroy()
  }
}
