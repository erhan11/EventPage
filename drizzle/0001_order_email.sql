ALTER TABLE "orders" ADD COLUMN "email_access_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tickets_emailed_at" timestamp with time zone;