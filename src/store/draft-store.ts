import { create } from "zustand"

export interface ActiveDraft {
  id: string
  savedAt: string | null
  title: string
}

interface DraftState {
  activeDraft: ActiveDraft | null
  clearActiveDraft: () => void
  setActiveDraft: (draft: ActiveDraft) => void
}

export const useDraftStore = create<DraftState>((set) => ({
  activeDraft: null,
  clearActiveDraft: () => set({ activeDraft: null }),
  setActiveDraft: (activeDraft) => set({ activeDraft }),
}))
