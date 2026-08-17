CREATE TABLE "handle_claims" (
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handle" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handle_claims" ADD CONSTRAINT "handle_claims_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handle_claims_user_idx" ON "handle_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scenes_author_published_idx" ON "scenes" USING btree ("author_id","status","published_at" DESC NULLS LAST);--> statement-breakpoint
INSERT INTO "handle_claims" ("handle", "user_id", "claimed_at") SELECT "handle", "user_id", "created_at" FROM "profiles" ON CONFLICT DO NOTHING;