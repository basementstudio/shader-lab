import { describe, expect, test } from "bun:test"
import { createAutosaveScheduler } from "@/lib/editor/autosave/scheduler"

function harness(options?: { debounceMs?: number; maxWaitMs?: number }) {
  let clock = 0
  let flushes = 0
  let nextHandle = 1
  let scheduled = 0
  const timers = new Map<number, { at: number; run: () => void }>()
  let suppressed = false

  const scheduler = createAutosaveScheduler({
    cancel: (handle) => timers.delete(handle),
    debounceMs: options?.debounceMs ?? 1200,
    isSuppressed: () => suppressed,
    maxWaitMs: options?.maxWaitMs ?? 5000,
    now: () => clock,
    onFlush: () => {
      flushes += 1
    },
    schedule: (run, ms) => {
      const handle = nextHandle++
      scheduled += 1
      timers.set(handle, { at: clock + ms, run })

      return handle
    },
  })

  function advance(ms: number) {
    const target = clock + ms

    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0]

      if (!due) {
        break
      }

      const [handle, timer] = due
      timers.delete(handle)
      clock = timer.at
      timer.run()
    }

    clock = target
  }

  return {
    advance,
    get flushes() {
      return flushes
    },
    get pending() {
      return timers.size
    },
    get scheduled() {
      return scheduled
    },
    scheduler,
    suppress(next: boolean) {
      suppressed = next
    },
  }
}

describe("createAutosaveScheduler", () => {
  test("fires once after the debounce settles", () => {
    const h = harness()

    h.scheduler.request()
    h.advance(1199)
    expect(h.flushes).toBe(0)

    h.advance(1)
    expect(h.flushes).toBe(1)
  })

  test("coalesces a burst into a single flush", () => {
    const h = harness()

    for (let i = 0; i < 20; i++) {
      h.scheduler.request()
      h.advance(100)
    }

    h.advance(1200)
    expect(h.flushes).toBe(1)
  })

  test("commits at the max wait during a continuous stream", () => {
    const h = harness({ debounceMs: 1200, maxWaitMs: 5000 })

    for (let elapsed = 0; elapsed < 5000; elapsed += 100) {
      h.scheduler.request()
      h.advance(100)
    }

    expect(h.flushes).toBe(1)
  })

  test("a 30 second drag commits roughly every max wait, not once", () => {
    const h = harness({ debounceMs: 1200, maxWaitMs: 5000 })

    for (let elapsed = 0; elapsed < 30_000; elapsed += 100) {
      h.scheduler.request()
      h.advance(100)
    }

    expect(h.flushes).toBeGreaterThanOrEqual(5)
    expect(h.flushes).toBeLessThanOrEqual(7)
  })

  test("does not flush while suppressed, then flushes after release", () => {
    const h = harness()

    h.suppress(true)
    h.scheduler.request()
    h.advance(10_000)
    expect(h.flushes).toBe(0)

    h.suppress(false)
    h.advance(1200)
    expect(h.flushes).toBe(1)
  })

  test("flush() commits immediately when something is pending", () => {
    const h = harness()

    h.scheduler.request()
    h.scheduler.flush()
    expect(h.flushes).toBe(1)
  })

  test("flush() does nothing when nothing is pending", () => {
    const h = harness()

    h.scheduler.flush()
    expect(h.flushes).toBe(0)

    h.scheduler.request()
    h.advance(1200)
    h.scheduler.flush()
    expect(h.flushes).toBe(1)
  })

  test("cancel() drops the pending write and leaves no timer", () => {
    const h = harness()

    h.scheduler.request()
    h.scheduler.cancel()
    h.advance(10_000)

    expect(h.flushes).toBe(0)
    expect(h.pending).toBe(0)
  })

  test("retries on a real interval while suppressed instead of spinning", () => {
    const h = harness({ debounceMs: 1200, maxWaitMs: 5000 })

    h.suppress(true)
    h.scheduler.request()
    h.advance(60_000)

    expect(h.flushes).toBe(0)
    expect(h.scheduled).toBeLessThan(60)
  })

  test("never double-fires for one request", () => {
    const h = harness()

    h.scheduler.request()
    h.advance(1200)
    h.advance(10_000)

    expect(h.flushes).toBe(1)
  })
})
