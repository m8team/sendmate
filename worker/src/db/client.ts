import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb(env: Pick<Env, "DB">) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;
export type BatchItem = Parameters<Db["batch"]>[0][number];
export type BatchList = [BatchItem, ...BatchItem[]];
export type FormRow = typeof schema.forms.$inferSelect;
export type SubmissionRow = typeof schema.submissions.$inferSelect;
