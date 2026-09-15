import { LIMITS, type Limits } from "@sendm8/shared";

let cachedRaw: string | undefined;
let cached: Limits = LIMITS;

/** Shared limits, with optional per-deployment overrides from the LIMITS_JSON var. */
export function getLimits(env: Pick<Env, "LIMITS_JSON">): Limits {
  const raw = env.LIMITS_JSON ?? "";
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  cached = LIMITS;
  if (raw.trim()) {
    try {
      const overrides = JSON.parse(raw) as Partial<Limits>;
      const merged: Limits = { ...LIMITS };
      for (const key of Object.keys(LIMITS) as (keyof Limits)[]) {
        const value = overrides[key];
        if (typeof value === "number" && Number.isFinite(value)) merged[key] = value;
      }
      cached = merged;
    } catch {
      console.error("LIMITS_JSON is not valid JSON; using defaults");
    }
  }
  return cached;
}
