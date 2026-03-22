import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://atl:atl_secret@localhost:5432/atl";

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export type DB = typeof db;
