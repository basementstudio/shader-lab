type Saver = () => void

let saver: Saver | null = null

export function registerDraftSaver(next: Saver | null): void {
  saver = next
}

export function requestDraftSave(): void {
  saver?.()
}
