type Requester = () => void
type Flusher = () => Promise<void>

let requester: Requester | null = null
let flusher: Flusher | null = null

export function registerAutosaveRequester(next: Requester | null): void {
  requester = next
}

export function requestAutosave(): void {
  requester?.()
}

export function registerAutosaveFlusher(next: Flusher | null): void {
  flusher = next
}

export async function flushAutosave(): Promise<void> {
  await flusher?.()
}
