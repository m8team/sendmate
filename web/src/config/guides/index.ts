import { destinationGuides } from './destinations';
import { platformGuides } from './platforms';
import type { Guide } from './types';

export type { Guide, GuideBlock, GuideFaq } from './types';

/** Every /guides/<slug> page, platforms first. */
export const guides: Guide[] = [...platformGuides, ...destinationGuides];

export const guideFor = (slug: string) => guides.find((g) => g.slug === slug);

/** Words a reader actually reads: paragraphs, steps, notes and the FAQ, without code or markup. */
export function guideWordCount(guide: Guide): number {
  const text = [
    guide.intro,
    ...guide.blocks.flatMap((b) => ('p' in b ? [b.p] : 'steps' in b ? b.steps : 'note' in b ? [b.title, b.note] : 'h2' in b ? [b.h2] : [])),
    ...guide.faq.flatMap((f) => [f.q, f.a]),
  ].join(' ');
  return text.replace(/<[^>]+>/g, ' ').split(/\s+/).filter((w) => /\w/.test(w)).length;
}
