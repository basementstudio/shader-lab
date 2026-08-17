import {
  AUTOSAVE_KEEP_RECORDS,
  AUTOSAVE_SCHEMA_VERSION,
  AUTOSAVE_TTL_MS,
} from "@/lib/editor/autosave/limits"
import type { LabProjectFile } from "@/lib/editor/project-file"

export interface AutosaveRecord {
  projectFile: LabProjectFile
  remixOrigin: { slug: string; title: string } | null
  savedAt: number
  schemaVersion: number
  sessionId: string
}

export function buildAutosaveSignature(input: {
  projectFile: LabProjectFile
  remixOrigin: { slug: string; title: string } | null
}): string {
  const { exportedAt, ...rest } = input.projectFile

  void exportedAt

  return JSON.stringify({ document: rest, remix: input.remixOrigin })
}

export function chooseAutosaveRecord(input: {
  currentSessionId: string
  maxAgeMs?: number
  now: number
  records: readonly AutosaveRecord[]
}): AutosaveRecord | null {
  const maxAgeMs = input.maxAgeMs ?? AUTOSAVE_TTL_MS

  const usable = input.records
    .filter(
      (record) =>
        record.sessionId !== input.currentSessionId &&
        record.schemaVersion === AUTOSAVE_SCHEMA_VERSION &&
        input.now - record.savedAt <= maxAgeMs &&
        record.projectFile?.layers?.length > 0
    )
    .sort((a, b) => b.savedAt - a.savedAt)

  return usable[0] ?? null
}

export function planRecordPruning(input: {
  currentSessionId: string
  keep?: number
  now: number
  records: readonly AutosaveRecord[]
}): string[] {
  const keep = input.keep ?? AUTOSAVE_KEEP_RECORDS
  const expired: string[] = []
  const live: AutosaveRecord[] = []

  for (const record of input.records) {
    if (record.sessionId === input.currentSessionId) {
      continue
    }

    if (
      input.now - record.savedAt > AUTOSAVE_TTL_MS ||
      record.schemaVersion !== AUTOSAVE_SCHEMA_VERSION
    ) {
      expired.push(record.sessionId)
      continue
    }

    live.push(record)
  }

  const surplus = live
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(Math.max(0, keep - 1))
    .map((record) => record.sessionId)

  return [...new Set([...expired, ...surplus])]
}
