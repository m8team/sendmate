import { describe, expect, it } from 'vitest';
import { alternativesCheckedOn, hostedAlternatives, selfHosted, sendm8Alternative } from './alternatives';
import { LIMITS } from './limits';

describe('Formspree alternatives guide', () => {
  it('links every hosted service to at least one source on its own site', () => {
    for (const a of hostedAlternatives) {
      expect(a.sources.length, a.name).toBeGreaterThan(0);
      const host = new URL(a.url).hostname.replace(/^www\./, '');
      const own = a.sources.some((s) => new URL(s.url).hostname.replace(/^www\./, '').endsWith(host.split('.').slice(-2).join('.')));
      expect(own, `${a.name} should cite its own pages`).toBe(true);
    }
  });

  it('labels our own entry and quotes the limits we enforce', () => {
    expect(sendm8Alternative.ours).toBe(true);
    expect(hostedAlternatives.some((a) => a.ours)).toBe(false);
    expect(sendm8Alternative.freeSubmissions).toContain(LIMITS.submissionsPerFormPerMonth.toLocaleString('en-GB'));
  });

  it('dates the check and every self-hosted project', () => {
    expect(alternativesCheckedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const p of selfHosted) expect(p.lastCommit, p.name).toMatch(/\d{4}$/);
  });
});
