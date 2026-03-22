import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";
import { seed } from "./seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const connectionString =
  process.env.DATABASE_URL ?? "postgres://atl:atl_secret@localhost:5432/atl";

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

await migrate(db, {
  migrationsFolder: join(__dirname, "../../drizzle"),
});

console.log("Migrations complete");
await seed();
await client.end();
