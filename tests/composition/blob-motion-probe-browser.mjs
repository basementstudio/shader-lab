import * as THREE from "three/webgpu"
import { BlobTrackingPass } from "@/renderer/blob-tracking-pass"
import { createLayer } from "@/lib/editor/layers"

window.run = async () => {
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
  const canvas = document.createElement("canvas")
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext("2d")
  const input = new THREE.CanvasTexture(canvas)
  const target = new THREE.RenderTarget(1280, 720, { type: THREE.HalfFloatType, depthBuffer: false })
  const out = {}
  for (const mode of ["motion", "auto"]) {
    const pass = new BlobTrackingPass(`probe-${mode}`)
    pass.updateCompositionRole("effect")
    pass.flushColorNode()
    pass.resize(1280, 720)
    pass.updateLogicalSize(1280, 720)
    pass.updateParams({ ...createLayer("blob-tracking").params, detectionMode: mode, persistentTracking: true })
    const frames = []
    const seen = new Set()
    for (let frame = 0; frame < 90; frame++) {
      await new Promise((resolve) => video.requestVideoFrameCallback(resolve))
      context.drawImage(video, 0, 0)
      input.needsUpdate = true
      pass.render(renderer, input, target, frame / 30, 1 / 30, frame / 30)
      if (pass.pendingReadback) await pass.pendingReadback
      if (frame < 5) continue
      const blobs = pass.tracker.getBlobs()
      const grid = pass.latestAnalysis
      let above = 0
      let sum = 0
      const cells = grid.length / 4
      for (let i = 0; i < cells; i++) {
        const energy = grid[i * 4 + 2] / 255
        sum += grid[i * 4] / 255
        if (energy >= 0.12) above++
      }
      let fresh = 0
      for (const b of blobs) if (!seen.has(b.id)) { seen.add(b.id); fresh++ }
      frames.push({
        blobs: blobs.filter((b) => b.active).length,
        meanArea: blobs.length ? blobs.reduce((a, b) => a + b.area, 0) / blobs.length : 0,
        fresh,
        aboveFraction: above / cells,
        meanMotion: sum / cells,
        fallback: pass.tracker.luminanceFallbackActive,
      })
    }
    const avg = (key) => frames.reduce((a, f) => a + f[key], 0) / frames.length
    out[mode] = {
      frames: frames.length,
      avgActiveBlobs: avg("blobs"),
      avgMeanArea: avg("meanArea"),
      totalIds: seen.size,
      newIdsPerFrame: avg("fresh"),
      avgAboveFraction: avg("aboveFraction"),
      avgMeanMotion: avg("meanMotion"),
      fallbackFrames: frames.filter((f) => f.fallback).length,
    }
    if (pass.pendingReadback) await pass.pendingReadback
    pass.dispose()
  }
  video.pause()
  return out
}
