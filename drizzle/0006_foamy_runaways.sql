ALTER TABLE "scenes" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "scenes_tags_idx" ON "scenes" USING gin ("tags");