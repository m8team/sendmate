import { describe, expect, it } from 'vitest';
import { HEARD_FROM_SOURCES } from '@sendm8/shared';
import { HEARD_FROM_CHOICES, HEARD_FROM_LABELS, sourceShares } from './heardFrom';

describe('heard from', () => {
  it('offers every answer the API accepts, each with a label', () => {
    expect(HEARD_FROM_CHOICES.map((c) => c.value)).toEqual([...HEARD_FROM_SOURCES]);
    for (const c of HEARD_FROM_CHOICES) expect(c.label.length).toBeGreaterThan(3);
    expect(HEARD_FROM_LABELS.skipped).toBe('Skipped the question');
  });

  it('works out shares of real answers, leaving skips out', () => {
    expect(
      sourceShares([
        { source: 'ai_assistant', count: 3 },
        { source: 'skipped', count: 5 },
        { source: 'github', count: 1 },
      ]),
    ).toEqual([
      { source: 'ai_assistant', count: 3, label: 'AI assistant (ChatGPT, Claude…)', pct: 75 },
      { source: 'github', count: 1, label: 'GitHub', pct: 25 },
    ]);
    expect(sourceShares([{ source: 'skipped', count: 2 }])).toEqual([]);
  });
});
