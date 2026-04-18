import { defineConfig } from "drizzle-kit";
import path from "path";

// Make DATABASE_URL optional - only needed when running drizzle commands
// During publish/build, DATABASE_URL may not be available
const dbUrl = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost/dummy";

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
  casing: "snake_case",
  out: "./drizzle",
  // Never try to validate or push during build - API server handles all migrations
  migrations: {
    table: "__drizzle_migrations__",
    schema: "drizzle",
  },
});
