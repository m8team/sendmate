import { limitsWithOverrides } from '@sendm8/shared';

/** wrangler.jsonc's LIMITS_JSON, injected by astro.config.mjs at build time. */
declare const __LIMITS_JSON__: string | undefined;

/**
 * The limits this deployment enforces: the defaults in packages/shared/src/limits.ts plus the same LIMITS_JSON
 * overrides the Worker applies. Pages import these, not the bare defaults, so the site quotes what's enforced.
 */
export const LIMITS = limitsWithOverrides(typeof __LIMITS_JSON__ === 'string' ? __LIMITS_JSON__ : '');
