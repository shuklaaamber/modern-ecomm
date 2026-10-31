import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { // Migrations need a direct (non-pooler) connection: DDL and advisory locks misbehave through PgBouncer.
    url: (process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL)! },
});
