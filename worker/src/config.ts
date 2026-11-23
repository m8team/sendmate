import { LIMITS, limitsWithOverrides, type Limits } from "@sendm8/shared";

let cachedRaw: string | undefined;
let cached: Limits = LIMITS;

/** Shared limits, with optional per-deployment overrides from the LIMITS_JSON var. */
export function getLimits(env: Pick<Env, "LIMITS_JSON">): Limits {
  const raw = env.LIMITS_JSON ?? "";
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    cached = limitsWithOverrides(raw);
  } catch {
    console.error("LIMITS_JSON is not valid JSON; using defaults");
    cached = LIMITS;
  }
  return cached;
}
