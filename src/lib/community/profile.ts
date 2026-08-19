import { eq } from "drizzle-orm"
import { buildHandleCandidates } from "@/lib/community/handle"
import { censorText } from "@/lib/community/language"
import { getDatabase } from "@/lib/db"
import { handleClaims, profiles } from "@/lib/db/schema"

export const MAX_DISPLAY_NAME_LENGTH = 80

export function normalizeDisplayName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim() : ""

  return name.length > 0
    ? censorText(name.slice(0, MAX_DISPLAY_NAME_LENGTH))
    : null
}

export interface ProfileSeed {
  avatarUrl?: string | null
  email?: string | null
  name?: string | null
}

export interface CommunityProfile {
  avatarUrl: string | null
  displayName: string | null
  handle: string
  userId: string
}

const PG_UNIQUE_VIOLATION = "23505"

export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error

  for (let depth = 0; current && depth < 5; depth++) {
    const candidate = current as { cause?: unknown; code?: unknown }

    if (candidate.code === PG_UNIQUE_VIOLATION) {
      return true
    }

    if (
      current instanceof Error &&
      /duplicate key value|unique constraint/i.test(current.message)
    ) {
      return true
    }

    current = candidate.cause
  }

  return false
}

export async function findProfile(
  userId: string
): Promise<CommunityProfile | null> {
  const rows = await getDatabase()
    .select({
      avatarUrl: profiles.avatarUrl,
      displayName: profiles.displayName,
      handle: profiles.handle,
      userId: profiles.userId,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1)

  return rows[0] ?? null
}

const RETURNING = {
  avatarUrl: profiles.avatarUrl,
  displayName: profiles.displayName,
  handle: profiles.handle,
  userId: profiles.userId,
}

async function backfillMissingClaim(
  profile: CommunityProfile
): Promise<void> {
  try {
    await getDatabase()
      .insert(handleClaims)
      .values({ handle: profile.handle, userId: profile.userId })
      .onConflictDoNothing({ target: handleClaims.handle })
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }
  }
}

export async function ensureProfile(
  userId: string,
  seed: ProfileSeed
): Promise<CommunityProfile> {
  const db = getDatabase()
  const existing = await findProfile(userId)

  if (existing) {
    await backfillMissingClaim(existing)

    const displayName = normalizeDisplayName(seed.name) ?? existing.displayName
    const avatarUrl = seed.avatarUrl ?? existing.avatarUrl

    if (
      displayName === existing.displayName &&
      avatarUrl === existing.avatarUrl
    ) {
      return existing
    }

    const refreshed = await db
      .update(profiles)
      .set({ avatarUrl, displayName, updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning(RETURNING)

    return refreshed[0] ?? existing
  }

  for (const handle of buildHandleCandidates(seed)) {
    try {
      const [inserted] = await db.batch([
        db
          .insert(profiles)
          .values({
            avatarUrl: seed.avatarUrl ?? null,
            displayName: normalizeDisplayName(seed.name),
            handle,
            userId,
          })
          .returning(RETURNING),
        db.insert(handleClaims).values({ handle, userId }),
      ])

      const row = inserted[0]

      if (row) {
        return row
      }
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error
      }

      const raced = await findProfile(userId)

      if (raced) {
        return raced
      }
    }
  }

  throw new Error(
    `Could not allocate a community handle for user ${userId}; every candidate was taken.`
  )
}
