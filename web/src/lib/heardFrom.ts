/** "How did you hear about sendm8?": the choices and their labels, shared by the question and the admin panel. */
import { HEARD_FROM_SOURCES, type HeardFrom } from '@sendm8/shared';

export const HEARD_FROM_LABELS: Record<HeardFrom | 'skipped', string> = {
  search: 'Search engine',
  ai_assistant: 'AI assistant (ChatGPT, Claude…)',
  github: 'GitHub',
  social: 'Social media',
  friend: 'A friend or colleague',
  article: 'A blog post or article',
  other: 'Something else',
  skipped: 'Skipped the question',
};

export const HEARD_FROM_CHOICES = HEARD_FROM_SOURCES.map((value) => ({ value, label: HEARD_FROM_LABELS[value] }));

/** The free-text box is optional and capped, matching the API. */
export const HEARD_FROM_DETAIL_MAX = 200;

/** Share of all answers, as a whole percentage (skips excluded, so the bars describe real answers). */
export function sourceShares(sources: { source: HeardFrom | 'skipped'; count: number }[]) {
  const answered = sources.filter((s) => s.source !== 'skipped');
  const total = answered.reduce((sum, s) => sum + s.count, 0);
  return answered.map((s) => ({ ...s, label: HEARD_FROM_LABELS[s.source], pct: total ? Math.round((s.count / total) * 100) : 0 }));
}
