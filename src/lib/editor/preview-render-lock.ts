export type PreviewRenderLockReason = "export" | "idle"

const counts: Record<PreviewRenderLockReason, number> = {
  export: 0,
  idle: 0,
}

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function acquirePreviewRenderLock(
  reason: PreviewRenderLockReason = "idle"
): () => void {
  counts[reason] += 1
  let released = false
  notify()

  return () => {
    if (released) {
      return
    }

    released = true
    counts[reason] = Math.max(0, counts[reason] - 1)
    notify()
  }
}

export function isPreviewRenderLocked(): boolean {
  return counts.export > 0 || counts.idle > 0
}

export function isPreviewExporting(): boolean {
  return counts.export > 0
}

export function subscribeToPreviewRenderLock(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
