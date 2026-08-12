CREATE TYPE "public"."asset_provider" AS ENUM('cf-images', 'cf-stream', 'r2');--> statement-breakpoint
CREATE TYPE "public"."scene_status" AS ENUM('draft', 'processing', 'published', 'takendown');--> statement-breakpoint
CREATE TABLE "likes" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scene_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "likes_user_id_scene_id_pk" PRIMARY KEY("user_id","scene_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handle" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid PRIMARY KEY NOT NULL,
	CONSTRAINT "profiles_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "remixes" (
	"actor_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day_bucket" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"scene_id" text NOT NULL,
	CONSTRAINT "remixes_actor_day_unique" UNIQUE("scene_id","actor_key","day_bucket")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"note" text,
	"reason" text NOT NULL,
	"reporter_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"scene_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_assets" (
	"asset_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration" double precision,
	"height" integer,
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text,
	"provider" "asset_provider" NOT NULL,
	"provider_id" text NOT NULL,
	"scene_id" text NOT NULL,
	"sha256" text,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"url" text NOT NULL,
	"width" integer,
	CONSTRAINT "scene_assets_scene_asset_unique" UNIQUE("scene_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"author_id" uuid NOT NULL,
	"composition_height" integer NOT NULL,
	"composition_width" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"duration_seconds" double precision DEFAULT 0 NOT NULL,
	"featured_at" timestamp with time zone,
	"forked_from_id" text,
	"has_custom_shader" boolean DEFAULT false NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"lab_key" text NOT NULL,
	"lab_version" integer NOT NULL,
	"layer_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"preview_video_uid" text,
	"published_at" timestamp with time zone,
	"remix_count" integer DEFAULT 0 NOT NULL,
	"slug" text NOT NULL,
	"status" "scene_status" DEFAULT 'draft' NOT NULL,
	"thumbnail_image_id" text,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "upload_quota" (
	"bytes_used" bigint DEFAULT 0 NOT NULL,
	"day_bucket" text NOT NULL,
	"scenes_today" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remixes" ADD CONSTRAINT "remixes_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_profiles_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_profiles_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_assets" ADD CONSTRAINT "scene_assets_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_author_id_profiles_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_forked_from_id_scenes_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_quota" ADD CONSTRAINT "upload_quota_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "likes_scene_idx" ON "likes" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "remixes_scene_idx" ON "remixes" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "reports_scene_idx" ON "reports" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "reports_open_idx" ON "reports" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "scene_assets_scene_idx" ON "scene_assets" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "scene_assets_sha256_idx" ON "scene_assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "scenes_latest_idx" ON "scenes" USING btree ("status","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scenes_popular_idx" ON "scenes" USING btree ("status","like_count" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scenes_author_idx" ON "scenes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "scenes_featured_idx" ON "scenes" USING btree ("featured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scenes_forked_from_idx" ON "scenes" USING btree ("forked_from_id");--> statement-breakpoint
CREATE INDEX "scenes_layer_types_idx" ON "scenes" USING gin ("layer_types");