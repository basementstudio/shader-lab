let lockCount = 0

export function acquirePreviewRenderLock(): () => void {
  lockCount += 1
  let released = false

  return () => {
    if (released) {
      return
    }

    released = true
    lockCount = Math.max(0, lockCount - 1)
  }
}

export function isPreviewRenderLocked(): boolean {
  return lockCount > 0
}
