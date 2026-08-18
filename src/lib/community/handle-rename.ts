import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm"
import { describeHandleInput } from "@/lib/community/handle"
import { findProfile, isUniqueViolation } from "@/lib/community/profile"
import { getDatabase } from "@/lib/db"
import { handleClaims, profiles } from "@/lib/db/schema"

export const HANDLE_RENAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_HANDLE_CLAIMS = 10

export type RenameOutcome =
  | { handle: string; kind: "renamed"; previous: string }
  | { handle: string; kind: "unchanged" }
  | { kind: "cooldown"; retryAfter: string }
  | { kind: "exhausted" }
  | { kind: "invalid"; reason: string }
  | { kind: "missing" }
  | { kind: "taken" }

export interface RenameStatus {
  canRenameAt: string | null
  renamesUsed: number
}

async function readClaims(userId: string): Promise<Date[]> {
  const rows = await getDatabase()
    .select({ claimedAt: handleClaims.claimedAt })
    .from(handleClaims)
    .where(eq(handleClaims.userId, userId))
    .orderBy(desc(handleClaims.claimedAt))

  return rows.map((row) => row.claimedAt)
}

export function decideAllowance(input: {
  claimCount: number
  now: Date
  renamedAt: Date | null
}): { canRenameAt: Date | null; exhausted: boolean } {
  if (input.claimCount >= MAX_HANDLE_CLAIMS) {
    return { canRenameAt: null, exhausted: true }
  }

  if (!input.renamedAt) {
    return { canRenameAt: null, exhausted: false }
  }

  const ready = new Date(input.renamedAt.getTime() + HANDLE_RENAME_COOLDOWN_MS)

  return {
    canRenameAt: ready.getTime() > input.now.getTime() ? ready : null,
    exhausted: false,
  }
}

async function readAllowanceInputs(
  userId: string
): Promise<{ claimCount: number; renamedAt: Date | null }> {
  const [claims, rows] = await Promise.all([
    readClaims(userId),
    getDatabase()
      .select({ renamedAt: profiles.handleRenamedAt })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1),
  ])

  return { claimCount: claims.length, renamedAt: rows[0]?.renamedAt ?? null }
}

export async function getRenameStatus(
  userId: string,
  now = new Date()
): Promise<RenameStatus> {
  const { claimCount, renamedAt } = await readAllowanceInputs(userId)
  const { canRenameAt } = decideAllowance({ claimCount, now, renamedAt })

  return {
    canRenameAt: canRenameAt?.toISOString() ?? null,
    renamesUsed: Math.max(0, claimCount - 1),
  }
}

export async function renameHandle(input: {
  next: unknown
  now?: Date
  userId: string
}): Promise<RenameOutcome> {
  const now = input.now ?? new Date()
  const profile = await findProfile(input.userId)

  if (!profile) {
    return { kind: "missing" }
  }

  const described = describeHandleInput(input.next)

  if ("reason" in described) {
    return { kind: "invalid", reason: described.reason }
  }

  const { handle } = described

  if (handle === profile.handle) {
    return { handle, kind: "unchanged" }
  }

  const allowance = await readAllowanceInputs(input.userId)
  const { canRenameAt, exhausted } = decideAllowance({ ...allowance, now })

  if (exhausted) {
    return { kind: "exhausted" }
  }

  if (canRenameAt) {
    return { kind: "cooldown", retryAfter: canRenameAt.toISOString() }
  }

  const db = getDatabase()
  const owner = await db
    .select({ userId: handleClaims.userId })
    .from(handleClaims)
    .where(eq(handleClaims.handle, handle))
    .limit(1)

  const heldBy = owner[0]?.userId

  if (heldBy && heldBy !== input.userId) {
    return { kind: "taken" }
  }

  let renamed = false

  try {
    renamed = await claimHandleAtomically({
      handle,
      now,
      userId: input.userId,
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { kind: "taken" }
    }

    throw error
  }

  if (!renamed) {
    return describeLostRace(await readAllowanceInputs(input.userId), now)
  }

  return { handle, kind: "renamed", previous: profile.handle }
}

async function claimHandleAtomically(input: {
  handle: string
  now: Date
  userId: string
}): Promise<boolean> {
  const cutoff = new Date(input.now.getTime() - HANDLE_RENAME_COOLDOWN_MS)
  const db = getDatabase()

  const won = await db
    .update(profiles)
    .set({ handle: input.handle, handleRenamedAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(profiles.userId, input.userId),
        or(
          isNull(profiles.handleRenamedAt),
          lte(profiles.handleRenamedAt, cutoff)
        ),
        sql`(
          select count(*) from ${handleClaims}
          where ${handleClaims.userId} = ${input.userId}::uuid
        ) < ${MAX_HANDLE_CLAIMS}`
      )
    )
    .returning({ handle: profiles.handle })

  if (won.length === 0) {
    return false
  }

  await db
    .insert(handleClaims)
    .values({ claimedAt: input.now, handle: input.handle, userId: input.userId })
    .onConflictDoUpdate({
      set: { claimedAt: input.now },
      target: handleClaims.handle,
      setWhere: eq(handleClaims.userId, input.userId),
    })

  return true
}

function describeLostRace(
  allowance: { claimCount: number; renamedAt: Date | null },
  now: Date
): RenameOutcome {
  const { canRenameAt, exhausted } = decideAllowance({ ...allowance, now })

  if (exhausted) {
    return { kind: "exhausted" }
  }

  return {
    kind: "cooldown",
    retryAfter: (
      canRenameAt ?? new Date(now.getTime() + HANDLE_RENAME_COOLDOWN_MS)
    ).toISOString(),
  }
}
