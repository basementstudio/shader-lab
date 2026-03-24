import { create } from "zustand"
import type { EditorHistorySnapshot, HistoryEntry } from "@/types/editor"

export interface HistoryStoreState {
  future: HistoryEntry[]
  past: HistoryEntry[]
  pendingTimer: ReturnType<typeof setTimeout> | null
}

export interface HistoryStoreActions {
  canRedo: () => boolean
  canUndo: () => boolean
  clearHistory: () => void
  pushSnapshot: (
    label: string,
    snapshot: EditorHistorySnapshot,
    options?: { debounce?: boolean },
  ) => void
  redo: (currentSnapshot: EditorHistorySnapshot) => EditorHistorySnapshot | null
  undo: (currentSnapshot: EditorHistorySnapshot) => EditorHistorySnapshot | null
}

export type HistoryStore = HistoryStoreState & HistoryStoreActions

const MAX_HISTORY = 50
const DEBOUNCE_MS = 250

function createHistoryEntry(
  label: string,
  snapshot: EditorHistorySnapshot,
): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    label,
    snapshot,
    timestamp: Date.now(),
  }
}

function pushPastEntry(past: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const nextPast = [...past, entry]

  if (nextPast.length <= MAX_HISTORY) {
    return nextPast
  }

  return nextPast.slice(nextPast.length - MAX_HISTORY)
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  future: [],
  past: [],
  pendingTimer: null,

  pushSnapshot: (label, snapshot, options) => {
    const entry = createHistoryEntry(label, snapshot)
    const shouldDebounce = options?.debounce ?? false

    if (!shouldDebounce) {
      const timer = get().pendingTimer

      if (timer) {
        clearTimeout(timer)
      }

      set((state) => ({
        future: [],
        past: pushPastEntry(state.past, entry),
        pendingTimer: null,
      }))
      return
    }

    const timer = get().pendingTimer

    if (timer) {
      clearTimeout(timer)
    }

    const nextTimer = setTimeout(() => {
      set((state) => ({
        future: [],
        past: pushPastEntry(state.past, entry),
        pendingTimer: null,
      }))
    }, DEBOUNCE_MS)

    set({
      pendingTimer: nextTimer,
    })
  },

  undo: (currentSnapshot) => {
    const state = get()
    const previous = state.past[state.past.length - 1]

    if (!previous) {
      return null
    }

    set({
      future: [createHistoryEntry("Redo state", currentSnapshot), ...state.future],
      past: state.past.slice(0, -1),
    })

    return previous.snapshot
  },

  redo: (currentSnapshot) => {
    const state = get()
    const [next, ...future] = state.future

    if (!next) {
      return null
    }

    set({
      future,
      past: pushPastEntry(state.past, createHistoryEntry("Undo state", currentSnapshot)),
    })

    return next.snapshot
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  clearHistory: () => {
    const timer = get().pendingTimer

    if (timer) {
      clearTimeout(timer)
    }

    set({
      future: [],
      past: [],
      pendingTimer: null,
    })
  },
}))

export function registerHistoryShortcuts(
  onUndo: () => void,
  onRedo: () => void,
): () => void {
  function handleKeyDown(event: KeyboardEvent) {
    const isMac = navigator.platform.toLowerCase().includes("mac")
    const ctrlOrMeta = isMac ? event.metaKey : event.ctrlKey

    if (!ctrlOrMeta) {
      return
    }

    if (event.key === "z" && !event.shiftKey) {
      event.preventDefault()
      onUndo()
      return
    }

    if ((event.key === "z" && event.shiftKey) || event.key === "y") {
      event.preventDefault()
      onRedo()
    }
  }

  window.addEventListener("keydown", handleKeyDown)

  return () => {
    window.removeEventListener("keydown", handleKeyDown)
  }
}
