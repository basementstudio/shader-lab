"use client"

export type LiveVideoRecordingProgress = {
  elapsed: number
  duration: number
  value: number
}

type RecordLiveCanvasVideoOptions = {
  canvas: HTMLCanvasElement
  duration: number
  fps: number
  mimeType: string
  onProgress?: (progress: LiveVideoRecordingProgress) => void
  signal?: AbortSignal
  stopSignal?: AbortSignal
}

export function getSupportedLiveVideoMimeTypes(): {
  mp4: string | null
  webm: string | null
} {
  if (typeof MediaRecorder === "undefined") {
    return { mp4: null, webm: null }
  }

  const webmTypes = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ]
  const mp4Types = ["video/mp4;codecs=h264", "video/mp4"]

  return {
    mp4: mp4Types.find((type) => MediaRecorder.isTypeSupported(type)) ?? null,
    webm: webmTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? null,
  }
}

export function recordLiveCanvasVideo({
  canvas,
  duration,
  fps,
  mimeType,
  onProgress,
  signal,
  stopSignal,
}: RecordLiveCanvasVideoOptions): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") {
    return Promise.reject(
      new Error("Live recording is not supported in this browser.")
    )
  }

  if (typeof canvas.captureStream !== "function") {
    return Promise.reject(
      new Error("Canvas live recording is not supported in this browser.")
    )
  }

  return new Promise((resolve, reject) => {
    const chunks: BlobPart[] = []
    const stream = canvas.captureStream(Math.max(1, Math.round(fps)))
    const recorder = new MediaRecorder(stream, { mimeType })
    const startTime = performance.now()
    const targetDuration = Math.max(0.25, duration)
    let animationFrame: number | null = null
    let stopTimer: number | null = null
    let settled = false

    const cleanup = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
      }
      if (stopTimer !== null) {
        window.clearTimeout(stopTimer)
      }
      for (const track of stream.getTracks()) {
        track.stop()
      }
      signal?.removeEventListener("abort", handleAbort)
      stopSignal?.removeEventListener("abort", handleStop)
    }

    const finish = (callback: () => void) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      callback()
    }

    const stopRecorder = () => {
      if (recorder.state !== "inactive") {
        recorder.stop()
      }
    }

    const handleAbort = () => {
      finish(() => {
        if (recorder.state !== "inactive") {
          recorder.stop()
        }
        reject(new DOMException("Live recording cancelled.", "AbortError"))
      })
    }

    const handleStop = () => {
      stopRecorder()
    }

    const tick = () => {
      const elapsed = Math.min(
        targetDuration,
        (performance.now() - startTime) / 1000
      )

      onProgress?.({
        duration: targetDuration,
        elapsed,
        value: elapsed / targetDuration,
      })

      if (!settled) {
        animationFrame = window.requestAnimationFrame(tick)
      }
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    recorder.onerror = () => {
      finish(() => {
        reject(new Error("Live recording failed."))
      })
    }

    recorder.onstop = () => {
      if (settled) {
        return
      }

      finish(() => {
        resolve(new Blob(chunks, { type: mimeType }))
      })
    }

    if (signal?.aborted) {
      handleAbort()
      return
    }

    signal?.addEventListener("abort", handleAbort)
    stopSignal?.addEventListener("abort", handleStop)
    recorder.start(250)
    if (stopSignal?.aborted) {
      handleStop()
    }
    tick()
    stopTimer = window.setTimeout(stopRecorder, targetDuration * 1000)
  })
}
