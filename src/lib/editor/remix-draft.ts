export const REMIX_DRAFT_SETTLE_MS = 1500

export interface ArmedRemixDraft {
  armedAt: number
  title: string
}

let armed: ArmedRemixDraft | null = null

export function armRemixDraft(input: { title: string }): void {
  armed = { armedAt: Date.now(), title: input.title }
}

export function disarmRemixDraft(): void {
  armed = null
}

export function readArmedRemixDraft(): ArmedRemixDraft | null {
  return armed
}
