import { deleteRecord, deleteRecords, readAll } from "@/lib/editor/autosave/idb"
import { AUTOSAVE_SCHEMA_VERSION } from "@/lib/editor/autosave/limits"
import {
  type AutosaveRecord,
  chooseAutosaveRecord,
  planRecordPruning,
} from "@/lib/editor/autosave/record"
import { writeRecord } from "@/lib/editor/autosave/idb"
import { parseLabProjectFileValue } from "@/lib/editor/project-file"

const sessionId =
  typeof crypto === "undefined" ? "server" : crypto.randomUUID()

export function autosaveSessionId(): string {
  return sessionId
}

export async function saveAutosaveRecord(input: {
  projectFile: AutosaveRecord["projectFile"]
  remixOrigin: AutosaveRecord["remixOrigin"]
}): Promise<boolean> {
  const now = Date.now()
  const written = await writeRecord({
    projectFile: input.projectFile,
    remixOrigin: input.remixOrigin,
    savedAt: now,
    schemaVersion: AUTOSAVE_SCHEMA_VERSION,
    sessionId,
  } satisfies AutosaveRecord)

  if (!written) {
    return false
  }

  const records = await readAll<AutosaveRecord>()

  if (records) {
    await deleteRecords(
      planRecordPruning({ currentSessionId: sessionId, now, records })
    )
  }

  return true
}

export interface RestorableAutosave {
  projectFile: AutosaveRecord["projectFile"]
  remixOrigin: AutosaveRecord["remixOrigin"]
  savedAt: number
  sessionId: string
}

export async function findRestorableAutosave(): Promise<RestorableAutosave | null> {
  const records = await readAll<AutosaveRecord>()

  if (!records || records.length === 0) {
    return null
  }

  const candidate = chooseAutosaveRecord({
    currentSessionId: sessionId,
    now: Date.now(),
    records,
  })

  if (!candidate) {
    return null
  }

  try {
    return {
      projectFile: parseLabProjectFileValue(candidate.projectFile),
      remixOrigin: candidate.remixOrigin,
      savedAt: candidate.savedAt,
      sessionId: candidate.sessionId,
    }
  } catch {
    await deleteRecord(candidate.sessionId)

    return null
  }
}

export function forgetAutosaveRecord(id: string): Promise<unknown> {
  return deleteRecord(id)
}

export function forgetOwnAutosaveRecord(): Promise<unknown> {
  return deleteRecord(sessionId)
}

export async function listLiveAutosaveRecords(): Promise<AutosaveRecord[]> {
  return (await readAll<AutosaveRecord>()) ?? []
}
