let lockCount = 0

const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function acquirePreviewRenderLock(): () => void {
  lockCount += 1
  let released = false
  notify()

  return () => {
    if (released) {
      return
    }

    released = true
    lockCount = Math.max(0, lockCount - 1)
    notify()
  }
}

export function isPreviewRenderLocked(): boolean {
  return lockCount > 0
}

export function subscribeToPreviewRenderLock(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
