import * as THREE from "three/webgpu"
import type { EditorRenderer, RendererFrame } from "@/renderer/contracts"
import { PipelineManager } from "@/renderer/pipeline-manager"
import type { Size } from "@/types/editor"

export function browserSupportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator
}

type GpuQueueLike = { onSubmittedWorkDone: () => Promise<unknown> }
type GpuDeviceLike = { destroy?: () => void; queue?: GpuQueueLike }

function getGpuDevice(instance: THREE.WebGPURenderer): GpuDeviceLike | null {
  return (
    (instance as unknown as { backend?: { device?: GpuDeviceLike } }).backend
      ?.device ?? null
  )
}

function getGpuQueue(instance: THREE.WebGPURenderer): GpuQueueLike | null {
  const queue = getGpuDevice(instance)?.queue

  if (!queue || typeof queue.onSubmittedWorkDone !== "function") {
    return null
  }

  return queue
}

export async function createWebGPURenderer(
  canvas: HTMLCanvasElement
): Promise<EditorRenderer> {
  const renderer = new THREE.WebGPURenderer({
    alpha: false,
    antialias: false,
    canvas,
  })
  let pipeline: PipelineManager | null = null

  function renderFrame(frame: RendererFrame) {
    if (!pipeline) {
      pipeline = new PipelineManager(renderer, frame.viewportSize)
    }

    pipeline.updateLogicalSize(frame.logicalSize)
    pipeline.updateBackgroundColor(frame.sceneConfig.backgroundColor)
    pipeline.updateSceneConfig(frame.sceneConfig)
    pipeline.updateOutputCropAspectRatio(frame.cropAspectRatio)
    pipeline.syncLayers([...frame.layers].reverse())
    pipeline.render(
      frame.clock.time,
      frame.clock.delta,
      frame.clock.timelineTime
    )
  }

  return {
    async initialize() {
      await renderer.init()
      ;(
        renderer as THREE.WebGPURenderer & {
          outputColorSpace: string
          toneMapping: number
        }
      ).outputColorSpace = THREE.SRGBColorSpace
      ;(
        renderer as THREE.WebGPURenderer & {
          outputColorSpace: string
          toneMapping: number
        }
      ).toneMapping = THREE.NoToneMapping
      renderer.setClearColor("#0a0d10", 1)
    },

    hasPendingCompilations() {
      return pipeline?.hasPendingCompilations() ?? false
    },

    hasPendingResources() {
      return (
        (pipeline?.hasPendingCompilations() ?? false) ||
        (pipeline?.hasPendingMediaLoads() ?? false)
      )
    },

    resize(size: Size, pixelRatio: number) {
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(size.width, size.height, false)
      pipeline?.resize(size)
    },

    render(frame: RendererFrame) {
      renderFrame(frame)
    },

    setPreviewFrozen(frozen: boolean) {
      pipeline?.setPreviewFrozen(frozen)
    },

    async waitForGpuIdle() {
      const queue = getGpuQueue(renderer)

      if (!queue) {
        return false
      }

      await queue.onSubmittedWorkDone()
      return true
    },

    async prepareForExportFrame(time: number, loop: boolean) {
      await pipeline?.prepareForExportFrame(time, loop)
    },

    exportFrame(frame: RendererFrame, _renderSize: Size): HTMLCanvasElement {
      renderFrame(frame)

      const w = canvas.width
      const h = canvas.height
      const snapshot = document.createElement("canvas")
      snapshot.width = w
      snapshot.height = h
      const ctx = snapshot.getContext("2d")!
      ctx.drawImage(canvas, 0, 0)

      return snapshot
    },

    dispose() {
      renderer.setAnimationLoop(null)
      pipeline?.dispose()
      renderer.dispose()
    },

    async destroyDevice() {
      const device = getGpuDevice(renderer)

      if (typeof device?.destroy !== "function") {
        return
      }

      try {
        await getGpuQueue(renderer)?.onSubmittedWorkDone()
        device.destroy()
      } catch {
        return
      }
    },
  }
}
