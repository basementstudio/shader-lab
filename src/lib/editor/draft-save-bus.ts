export interface DraftSaveRequest {
  asNewDraft?: boolean
}

type Saver = (request: DraftSaveRequest) => void

let saver: Saver | null = null

export function registerDraftSaver(next: Saver | null): void {
  saver = next
}

export function requestDraftSave(request: DraftSaveRequest = {}): void {
  saver?.(request)
}
