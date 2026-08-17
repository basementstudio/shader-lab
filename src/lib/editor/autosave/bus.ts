type Requester = () => void

let requester: Requester | null = null

export function registerAutosaveRequester(next: Requester | null): void {
  requester = next
}

export function requestAutosave(): void {
  requester?.()
}
