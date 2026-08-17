import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow()

const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()

export const profiles = pgTable("profiles", {
  avatarUrl: text("avatar_url"),
  createdAt,
  displayName: text("display_name"),
  handle: text("handle").notNull().unique(),
  updatedAt,
  userId: uuid("user_id").primaryKey(),
})

export const handleClaims = pgTable(
  "handle_claims",
  {
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    handle: text("handle").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
  },
  (table) => [index("handle_claims_user_idx").on(table.userId)]
)

export const sceneStatus = pgEnum("scene_status", [
  "draft",
  "processing",
  "published",
  "takendown",
])

export const assetProvider = pgEnum("asset_provider", [
  "cf-images",
  "cf-stream",
  "r2",
])

export const scenes = pgTable(
  "scenes",
  {
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    compositionHeight: integer("composition_height").notNull(),
    compositionWidth: integer("composition_width").notNull(),
    createdAt,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    description: text("description"),
    durationSeconds: doublePrecision("duration_seconds").notNull().default(0),
    featuredAt: timestamp("featured_at", { withTimezone: true }),
    forkedFromId: text("forked_from_id").references(
      (): AnyPgColumn => scenes.id,
      { onDelete: "set null" }
    ),
    hasCustomShader: boolean("has_custom_shader").notNull().default(false),
    id: text("id").primaryKey(),
    labKey: text("lab_key").notNull(),
    labVersion: integer("lab_version").notNull(),
    layerTypes: text("layer_types")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    likeCount: integer("like_count").notNull().default(0),
    previewVideoUid: text("preview_video_uid"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    remixCount: integer("remix_count").notNull().default(0),
    slug: text("slug").notNull().unique(),
    status: sceneStatus("status").notNull().default("draft"),
    thumbnailImageId: text("thumbnail_image_id"),
    title: text("title").notNull(),
    updatedAt,
  },
  (table) => [
    index("scenes_latest_idx").on(table.status, table.publishedAt.desc()),
    index("scenes_popular_idx").on(table.status, table.likeCount.desc()),
    index("scenes_author_idx").on(table.authorId),
    index("scenes_author_published_idx").on(
      table.authorId,
      table.status,
      table.publishedAt.desc()
    ),
    index("scenes_featured_idx").on(table.featuredAt.desc()),
    index("scenes_forked_from_idx").on(table.forkedFromId),
    index("scenes_layer_types_idx").using("gin", table.layerTypes),
  ]
)

export const sceneAssets = pgTable(
  "scene_assets",
  {
    assetId: text("asset_id").notNull(),
    createdAt,
    duration: doublePrecision("duration"),
    height: integer("height"),
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    mimeType: text("mime_type"),
    provider: assetProvider("provider").notNull(),
    providerId: text("provider_id").notNull(),
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    sha256: text("sha256"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    url: text("url").notNull(),
    width: integer("width"),
  },
  (table) => [
    index("scene_assets_scene_idx").on(table.sceneId),
    index("scene_assets_sha256_idx").on(table.sha256),
    unique("scene_assets_scene_asset_unique").on(table.sceneId, table.assetId),
  ]
)

export const likes = pgTable(
  "likes",
  {
    createdAt,
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.sceneId] }),
    index("likes_scene_idx").on(table.sceneId),
  ]
)

export const remixes = pgTable(
  "remixes",
  {
    actorKey: text("actor_key").notNull(),
    createdAt,
    dayBucket: text("day_bucket").notNull(),
    id: text("id").primaryKey(),
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("remixes_actor_day_unique").on(
      table.sceneId,
      table.actorKey,
      table.dayBucket
    ),
    index("remixes_scene_idx").on(table.sceneId),
  ]
)

export const reports = pgTable(
  "reports",
  {
    createdAt,
    id: text("id").primaryKey(),
    note: text("note"),
    reason: text("reason").notNull(),
    reporterId: uuid("reporter_id").references(() => profiles.userId, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => profiles.userId, {
      onDelete: "set null",
    }),
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("reports_scene_idx").on(table.sceneId),
    index("reports_open_idx").on(table.resolvedAt),
  ]
)

export const uploadQuota = pgTable("upload_quota", {
  bytesUsed: bigint("bytes_used", { mode: "number" }).notNull().default(0),
  dayBucket: text("day_bucket").notNull(),
  scenesToday: integer("scenes_today").notNull().default(0),
  updatedAt,
  userId: uuid("user_id")
    .primaryKey()
    .references(() => profiles.userId, { onDelete: "cascade" }),
})
