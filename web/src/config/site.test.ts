import { LIMITS as DEFAULTS, limitsWithOverrides } from '@sendm8/shared';
import { describe, expect, it } from 'vitest';
import { wranglerLimitsJson } from '../../limits-json.mjs';
import { LIMITS } from './limits';
import { limits } from './site';

// The marketing site once promised 100 emails a day and 10 MB files while the Worker enforced
// 10 and 5 MB. These tests keep every quoted number tied to what the backend actually does.
describe('marketing limits match the Worker', () => {
  it('quotes the enforced limits', () => {
    expect(limits).toMatchObject({
      emailsPerDay: LIMITS.instantEmailsPerUserPerDay,
      submissionsPerFormPerMonth: LIMITS.submissionsPerFormPerMonth,
      submissionsPerUnclaimedForm: LIMITS.submissionsPerUnclaimedFormPerMonth,
      forms: LIMITS.maxFormsPerUser,
      fileUploadMb: LIMITS.maxFileBytes / 1024 / 1024,
      submissionUploadMb: LIMITS.maxUploadBytes / 1024 / 1024,
      fieldsPerSubmission: LIMITS.maxFields,
      bodyKb: LIMITS.maxBodyBytes / 1024,
      ratePerIpPerMinute: LIMITS.burstPerIpPerFormPerMinute,
      ratePerFormPerMinute: LIMITS.burstPerFormPerMinute,
      spamRetentionDays: LIMITS.spamRetentionDays,
      digestHourUtc: LIMITS.digestHourUtc,
    });
  });

  it('only uses whole numbers where copy expects them', () => {
    for (const key of ['fileUploadMb', 'submissionUploadMb', 'bodyKb'] as const) {
      expect(Number.isInteger(limits[key]), key).toBe(true);
    }
  });
});

describe('deployment overrides', () => {
  it("reach the site, the same way the Worker applies them", () => {
    expect(LIMITS).toEqual(limitsWithOverrides(wranglerLimitsJson()));
  });

  it('only take known keys with finite numbers', () => {
    const merged = limitsWithOverrides('{"instantEmailsPerUserPerDay": 50, "notALimit": 1, "maxFields": "lots", "systemEmailsPerDay": null}');
    expect(merged.instantEmailsPerUserPerDay).toBe(50);
    expect(merged).not.toHaveProperty('notALimit');
    expect(merged.maxFields).toBe(DEFAULTS.maxFields);
    expect(merged.systemEmailsPerDay).toBe(DEFAULTS.systemEmailsPerDay);
    expect(limitsWithOverrides('')).toBe(DEFAULTS);
    expect(() => limitsWithOverrides('{nope')).toThrow();
  });
});
