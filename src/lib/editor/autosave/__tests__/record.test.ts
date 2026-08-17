import { describe, expect, test } from "bun:test"
import { AUTOSAVE_SCHEMA_VERSION } from "@/lib/editor/autosave/limits"
import {
  type AutosaveRecord,
  buildAutosaveSignature,
  chooseAutosaveRecord,
  planRecordPruning,
} from "@/lib/editor/autosave/record"
import type { LabProjectFile } from "@/lib/editor/project-file"

function projectFile(overrides?: Partial<LabProjectFile>): LabProjectFile {
  return {
    assets: [],
    composition: { height: 1080, width: 1920 },
    exportedAt: "2026-08-17T00:00:00.000Z",
    format: "shader-lab",
    layers: [{ id: "l1", type: "gradient" }],
    selectedLayerId: "l1",
    timeline: { duration: 10, loop: true, tracks: [] },
    version: 5,
    ...overrides,
  } as unknown as LabProjectFile
}

function record(overrides?: Partial<AutosaveRecord>): AutosaveRecord {
  return {
    projectFile: projectFile(),
    remixOrigin: null,
    savedAt: 1000,
    schemaVersion: AUTOSAVE_SCHEMA_VERSION,
    sessionId: "other",
    ...overrides,
  }
}

describe("buildAutosaveSignature", () => {
  test("ignores exportedAt, which changes on every build", () => {
    const a = buildAutosaveSignature({
      projectFile: projectFile({ exportedAt: "2026-01-01T00:00:00.000Z" }),
      remixOrigin: null,
    })
    const b = buildAutosaveSignature({
      projectFile: projectFile({ exportedAt: "2026-12-31T23:59:59.000Z" }),
      remixOrigin: null,
    })

    expect(a).toBe(b)
  })

  test("changes when the layer stack changes", () => {
    const a = buildAutosaveSignature({
      projectFile: projectFile(),
      remixOrigin: null,
    })
    const b = buildAutosaveSignature({
      projectFile: projectFile({
        layers: [{ id: "l1", type: "gradient" }, { id: "l2", type: "crt" }],
      } as Partial<LabProjectFile>),
      remixOrigin: null,
    })

    expect(a).not.toBe(b)
  })

  test("changes when the timeline duration or loop changes", () => {
    const base = buildAutosaveSignature({
      projectFile: projectFile(),
      remixOrigin: null,
    })

    expect(
      buildAutosaveSignature({
        projectFile: projectFile({
          timeline: { duration: 20, loop: true, tracks: [] },
        } as Partial<LabProjectFile>),
        remixOrigin: null,
      })
    ).not.toBe(base)

    expect(
      buildAutosaveSignature({
        projectFile: projectFile({
          timeline: { duration: 10, loop: false, tracks: [] },
        } as Partial<LabProjectFile>),
        remixOrigin: null,
      })
    ).not.toBe(base)
  })

  test("changes when the remix origin changes", () => {
    expect(
      buildAutosaveSignature({ projectFile: projectFile(), remixOrigin: null })
    ).not.toBe(
      buildAutosaveSignature({
        projectFile: projectFile(),
        remixOrigin: { slug: "a-1", title: "A" },
      })
    )
  })
})

describe("chooseAutosaveRecord", () => {
  test("skips this tab's own record", () => {
    expect(
      chooseAutosaveRecord({
        currentSessionId: "mine",
        now: 2000,
        records: [record({ sessionId: "mine" })],
      })
    ).toBeNull()
  })

  test("picks the newest record from another session", () => {
    const chosen = chooseAutosaveRecord({
      currentSessionId: "mine",
      now: 9000,
      records: [
        record({ savedAt: 1000, sessionId: "a" }),
        record({ savedAt: 8000, sessionId: "b" }),
        record({ savedAt: 4000, sessionId: "c" }),
      ],
    })

    expect(chosen?.sessionId).toBe("b")
  })

  test("ignores records past the ttl", () => {
    expect(
      chooseAutosaveRecord({
        currentSessionId: "mine",
        maxAgeMs: 1000,
        now: 10_000,
        records: [record({ savedAt: 1000, sessionId: "old" })],
      })
    ).toBeNull()
  })

  test("ignores a record written by a different schema version", () => {
    expect(
      chooseAutosaveRecord({
        currentSessionId: "mine",
        now: 2000,
        records: [record({ schemaVersion: 999 })],
      })
    ).toBeNull()
  })

  test("ignores a record with no layers", () => {
    expect(
      chooseAutosaveRecord({
        currentSessionId: "mine",
        now: 2000,
        records: [
          record({
            projectFile: projectFile({ layers: [] } as Partial<LabProjectFile>),
          }),
        ],
      })
    ).toBeNull()
  })

  test("returns null for an empty store", () => {
    expect(
      chooseAutosaveRecord({
        currentSessionId: "mine",
        now: 1,
        records: [],
      })
    ).toBeNull()
  })
})

describe("planRecordPruning", () => {
  test("never prunes this tab's own record", () => {
    const doomed = planRecordPruning({
      currentSessionId: "mine",
      now: 10_000_000_000,
      records: [record({ savedAt: 1, sessionId: "mine" })],
    })

    expect(doomed).not.toContain("mine")
  })

  test("drops expired and wrong-version records", () => {
    const doomed = planRecordPruning({
      currentSessionId: "mine",
      now: 40 * 24 * 60 * 60 * 1000,
      records: [
        record({ savedAt: 1, sessionId: "expired" }),
        record({ schemaVersion: 0, sessionId: "legacy" }),
      ],
    })

    expect(doomed).toContain("expired")
    expect(doomed).toContain("legacy")
  })

  test("keeps the newest few and drops the surplus", () => {
    const now = 100_000
    const doomed = planRecordPruning({
      currentSessionId: "mine",
      keep: 3,
      now,
      records: [
        record({ savedAt: now - 10, sessionId: "newest" }),
        record({ savedAt: now - 20, sessionId: "second" }),
        record({ savedAt: now - 30, sessionId: "third" }),
        record({ savedAt: now - 40, sessionId: "fourth" }),
      ],
    })

    expect(doomed).not.toContain("newest")
    expect(doomed).not.toContain("second")
    expect(doomed).toContain("third")
    expect(doomed).toContain("fourth")
  })

  test("returns no duplicates", () => {
    const doomed = planRecordPruning({
      currentSessionId: "mine",
      keep: 1,
      now: 40 * 24 * 60 * 60 * 1000,
      records: [record({ savedAt: 1, schemaVersion: 0, sessionId: "both" })],
    })

    expect(doomed).toEqual([...new Set(doomed)])
  })
})
