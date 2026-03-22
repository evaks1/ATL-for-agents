import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { apiKeys } from "./schema.js";

export async function seed() {
  const key = process.env.SEED_API_KEY;
  if (!key) return;

  const connectionString =
    process.env.DATABASE_URL ?? "postgres://atl:atl_secret@localhost:5432/atl";
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  await db
    .insert(apiKeys)
    .values({ key, principalId: "seed-principal", name: "seed" })
    .onConflictDoNothing();

  console.log(`Seed API key upserted: ${key}`);
  await client.end();
}
