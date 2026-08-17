export interface AutosaveScheduler {
  cancel: () => void
  flush: () => void
  request: () => void
}

export function createAutosaveScheduler(input: {
  cancel: (handle: number) => void
  debounceMs: number
  isSuppressed: () => boolean
  maxWaitMs: number
  now: () => number
  onFlush: () => void
  schedule: (run: () => void, ms: number) => number
}): AutosaveScheduler {
  let handle: number | null = null
  let firstRequestedAt: number | null = null

  function clear(): void {
    if (handle !== null) {
      input.cancel(handle)
      handle = null
    }
  }

  function commit(): void {
    clear()
    firstRequestedAt = null
    input.onFlush()
  }

  function arm(retryDelay?: number): void {
    clear()

    if (firstRequestedAt === null) {
      return
    }

    const waited = input.now() - firstRequestedAt
    const untilMaxWait = Math.max(0, input.maxWaitMs - waited)
    const delay = retryDelay ?? Math.min(input.debounceMs, untilMaxWait)

    handle = input.schedule(() => {
      handle = null

      if (input.isSuppressed()) {
        arm(input.debounceMs)

        return
      }

      commit()
    }, delay)
  }

  return {
    cancel(): void {
      clear()
      firstRequestedAt = null
    },

    flush(): void {
      if (firstRequestedAt === null) {
        return
      }

      commit()
    },

    request(): void {
      if (firstRequestedAt === null) {
        firstRequestedAt = input.now()
      }

      arm()
    },
  }
}
