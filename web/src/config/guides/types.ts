import type { DocsSectionId } from '../../components/docs/sections/docsSections';

/**
 * A guide is a list of blocks rendered by src/pages/guides/[slug].astro. Paragraph, step and note
 * text is trusted HTML we write ourselves (links and <code> only), never user input.
 */
export type GuideBlock =
  | { h2: string }
  | { p: string }
  | { steps: string[] }
  | { code: string; lang: string; filename?: string; highlight?: number[] }
  | { note: string; title: string; kind?: 'info' | 'warn' | 'accent' };

export interface GuideFaq {
  q: string;
  /** Plain text: it's also the FAQPage JSON-LD answer. */
  a: string;
}

export interface Guide {
  slug: string;
  /** "Contact form on …" guides, or "Send an HTML form to …" guides. */
  kind: 'platform' | 'destination';
  /** Short name for lists and breadcrumbs: "GitHub Pages", "Discord". */
  name: string;
  /** The page's h1, written the way people search for it. */
  h1: string;
  /** <title>, before " · sendm8". */
  title: string;
  /** Meta description, 120–160 characters. */
  description: string;
  /** The lede under the h1. Plain text. */
  intro: string;
  blocks: GuideBlock[];
  faq: GuideFaq[];
  /** Docs sections and /vs pages to link at the end. */
  related: { docs: DocsSectionId[]; vs: string[] };
}
