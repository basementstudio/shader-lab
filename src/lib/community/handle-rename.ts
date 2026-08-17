import { desc, eq } from "drizzle-orm"
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

function decideAllowance(
  claims: Date[],
  now: Date
): { canRenameAt: Date | null; exhausted: boolean } {
  if (claims.length >= MAX_HANDLE_CLAIMS) {
    return { canRenameAt: null, exhausted: true }
  }

  const latest = claims[0]

  if (!latest || claims.length === 1) {
    return { canRenameAt: null, exhausted: false }
  }

  const ready = new Date(latest.getTime() + HANDLE_RENAME_COOLDOWN_MS)

  return {
    canRenameAt: ready.getTime() > now.getTime() ? ready : null,
    exhausted: false,
  }
}

export async function getRenameStatus(
  userId: string,
  now = new Date()
): Promise<RenameStatus> {
  const claims = await readClaims(userId)
  const { canRenameAt } = decideAllowance(claims, now)

  return {
    canRenameAt: canRenameAt?.toISOString() ?? null,
    renamesUsed: Math.max(0, claims.length - 1),
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

  const claims = await readClaims(input.userId)
  const { canRenameAt, exhausted } = decideAllowance(claims, now)

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

  try {
    await db.batch([
      heldBy
        ? db
            .update(handleClaims)
            .set({ claimedAt: now })
            .where(eq(handleClaims.handle, handle))
        : db.insert(handleClaims).values({
            claimedAt: now,
            handle,
            userId: input.userId,
          }),
      db
        .update(profiles)
        .set({ handle, updatedAt: now })
        .where(eq(profiles.userId, input.userId)),
    ])
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { kind: "taken" }
    }

    throw error
  }

  return { handle, kind: "renamed", previous: profile.handle }
}
