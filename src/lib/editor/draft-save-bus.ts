export interface DraftSaveRequest {
  asNewDraft?: boolean
  auto?: boolean
  title?: string
  withThumbnail?: boolean
}

type Saver = (request: DraftSaveRequest) => void

let saver: Saver | null = null
let queued: DraftSaveRequest | null = null

export function registerDraftSaver(next: Saver | null): void {
  saver = next

  if (!(saver && queued)) {
    return
  }

  const pending = queued

  queued = null
  saver(pending)
}

export function requestDraftSave(request: DraftSaveRequest = {}): void {
  if (saver) {
    saver(request)

    return
  }

  queued = request
}
