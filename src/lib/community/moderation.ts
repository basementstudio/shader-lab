import { and, desc, eq, isNull, ne, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { CommunitySession } from "@/lib/auth/server"
import { isAdminEmail } from "@/lib/community/config"
import {
  deleteSceneObjects,
  keyFromPublicUrl,
  scenePrefixOf,
} from "@/lib/community/r2"
import type { ReportReason } from "@/lib/community/report-reasons"
import { getDatabase } from "@/lib/db"
import { profiles, reports, sceneAssets, scenes } from "@/lib/db/schema"

export type RemovalOutcome =
  | { kind: "forbidden" }
  | { kind: "notFound" }
  | {
      kind: "removed"
      mode: "deleted" | "takendown"
      purgedObjects: number
      retainedObjects: number
    }

async function collectDeletableKeys(sceneId: string): Promise<{
  deletable: string[]
  retained: number
}> {
  const db = getDatabase()

  const scene = (
    await db
      .select({
        labKey: scenes.labKey,
        thumbnailImageId: scenes.thumbnailImageId,
      })
      .from(scenes)
      .where(eq(scenes.id, sceneId))
      .limit(1)
  )[0]

  const ownPrefix = `scenes/${sceneId}`
  const deletable: string[] = []
  let retained = 0

  if (scene?.labKey && scenePrefixOf(scene.labKey) === ownPrefix) {
    deletable.push(scene.labKey)
  }

  const thumbnailKey = scene?.thumbnailImageId
    ? keyFromPublicUrl(scene.thumbnailImageId)
    : null

  if (thumbnailKey && scenePrefixOf(thumbnailKey) === ownPrefix) {
    deletable.push(thumbnailKey)
  }

  const assets = await db
    .select({ url: sceneAssets.url })
    .from(sceneAssets)
    .where(eq(sceneAssets.sceneId, sceneId))

  for (const asset of assets) {
    const key = keyFromPublicUrl(asset.url)

    if (!key || scenePrefixOf(key) !== ownPrefix) {
      continue
    }

    const usedElsewhere = await db
      .select({ sceneId: sceneAssets.sceneId })
      .from(sceneAssets)
      .innerJoin(scenes, eq(scenes.id, sceneAssets.sceneId))
      .where(
        and(
          eq(sceneAssets.url, asset.url),
          ne(sceneAssets.sceneId, sceneId),
          eq(scenes.status, "published"),
          isNull(scenes.deletedAt)
        )
      )
      .limit(1)

    if (usedElsewhere.length > 0) {
      retained += 1
      continue
    }

    deletable.push(key)
  }

  return { deletable, retained }
}

export function isModerator(session: CommunitySession | null): boolean {
  return isAdminEmail(session?.user.email)
}

export async function removeScene(input: {
  session: CommunitySession
  slug: string
}): Promise<RemovalOutcome> {
  const db = getDatabase()

  const rows = await db
    .select({
      authorId: scenes.authorId,
      deletedAt: scenes.deletedAt,
      id: scenes.id,
      status: scenes.status,
    })
    .from(scenes)
    .where(eq(scenes.slug, input.slug))
    .limit(1)

  const scene = rows[0]

  if (!scene) {
    return { kind: "notFound" }
  }

  const moderator = isModerator(input.session)
  const isAuthor = scene.authorId === input.session.user.id

  if (!(moderator || isAuthor)) {
    return { kind: "forbidden" }
  }

  const alreadyGone = scene.deletedAt !== null || scene.status === "takendown"

  if (alreadyGone) {
    return {
      kind: "removed",
      mode: moderator ? "takendown" : "deleted",
      purgedObjects: 0,
      retainedObjects: 0,
    }
  }

  const mode: "deleted" | "takendown" = isAuthor ? "deleted" : "takendown"

  await db
    .update(scenes)
    .set(
      mode === "takendown"
        ? { deletedAt: new Date(), status: "takendown" }
        : { deletedAt: new Date() }
    )
    .where(eq(scenes.id, scene.id))

  let purgedObjects = 0
  let retainedObjects = 0

  try {
    const { deletable, retained } = await collectDeletableKeys(scene.id)

    retainedObjects = retained
    purgedObjects = await deleteSceneObjects(deletable)
  } catch {
    purgedObjects = -1
  }

  return { kind: "removed", mode, purgedObjects, retainedObjects }
}

export async function reportScene(input: {
  note: string | null
  reason: ReportReason
  reporterId: string
  slug: string
}): Promise<"notFound" | "recorded" | "duplicate"> {
  const db = getDatabase()

  const rows = await db
    .select({ id: scenes.id })
    .from(scenes)
    .where(
      and(
        eq(scenes.slug, input.slug),
        eq(scenes.status, "published"),
        isNull(scenes.deletedAt)
      )
    )
    .limit(1)

  const scene = rows[0]

  if (!scene) {
    return "notFound"
  }

  const existing = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.sceneId, scene.id),
        eq(reports.reporterId, input.reporterId),
        isNull(reports.resolvedAt)
      )
    )
    .limit(1)

  if (existing[0]) {
    return "duplicate"
  }

  await db.insert(reports).values({
    id: `rep_${nanoid(16)}`,
    note: input.note,
    reason: input.reason,
    reporterId: input.reporterId,
    sceneId: scene.id,
  })

  return "recorded"
}

export interface OpenReport {
  authorHandle: string
  createdAt: string
  id: string
  note: string | null
  reason: string
  sceneSlug: string
  sceneStatus: string
  sceneTitle: string
  totalReports: number
}

export async function listOpenReports(limit = 100): Promise<OpenReport[]> {
  const rows = await getDatabase()
    .select({
      authorHandle: profiles.handle,
      createdAt: reports.createdAt,
      id: reports.id,
      note: reports.note,
      reason: reports.reason,
      sceneSlug: scenes.slug,
      sceneStatus: scenes.status,
      sceneTitle: scenes.title,
      totalReports: sql<number>`count(*) over (partition by ${reports.sceneId})`,
    })
    .from(reports)
    .innerJoin(scenes, eq(scenes.id, reports.sceneId))
    .innerJoin(profiles, eq(profiles.userId, scenes.authorId))
    .where(isNull(reports.resolvedAt))
    .orderBy(desc(reports.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200))

  return rows.map((row) => ({
    authorHandle: row.authorHandle,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    note: row.note,
    reason: row.reason,
    sceneSlug: row.sceneSlug,
    sceneStatus: row.sceneStatus,
    sceneTitle: row.sceneTitle,
    totalReports: Number(row.totalReports),
  }))
}

export async function resolveReportsForScene(input: {
  moderatorId: string
  slug: string
}): Promise<number> {
  const db = getDatabase()

  const rows = await db
    .select({ id: scenes.id })
    .from(scenes)
    .where(eq(scenes.slug, input.slug))
    .limit(1)

  const scene = rows[0]

  if (!scene) {
    return 0
  }

  const updated = await db
    .update(reports)
    .set({ resolvedAt: new Date(), resolvedBy: input.moderatorId })
    .where(and(eq(reports.sceneId, scene.id), isNull(reports.resolvedAt)))
    .returning({ id: reports.id })

  return updated.length
}
