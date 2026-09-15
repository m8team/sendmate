import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { docsSections } from '../components/docs/sections/docsSections';
import { site } from '../config/site';
import { docsToMarkdown, renderLlmsFullTxt, renderLlmsTxt, renderSectionMarkdown } from '../lib/llms-docs';

/** After the build, publishes the /docs page as Markdown for AI assistants (see src/lib/llms-docs.ts). */
export default function llmsDocs(): AstroIntegration {
  return {
    name: 'sendm8:llms-docs',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const html = await readFile(`${out}/docs/index.html`, 'utf8');
        const rendered = docsToMarkdown(html, `${site.url}/docs`);

        // Every section in the sidebar must come out the other end, in the same order.
        const ids = rendered.map((s) => s.id);
        const expected = docsSections.map((s) => s.id);
        if (ids.join() !== expected.join()) throw new Error(`llms docs: sections ${ids.join(', ')} don't match docsSections ${expected.join(', ')}`);

        const sections = rendered.map((s) => ({ ...s, summary: docsSections.find((d) => d.id === s.id)?.summary }));
        await mkdir(`${out}/docs`, { recursive: true });
        await Promise.all([
          writeFile(`${out}/llms.txt`, renderLlmsTxt(site, sections)),
          writeFile(`${out}/llms-full.txt`, renderLlmsFullTxt(site, sections)),
          ...sections.map((s) => writeFile(`${out}/docs/${s.id}.md`, renderSectionMarkdown(site, s))),
        ]);
        logger.info(`wrote llms.txt, llms-full.txt and ${sections.length} section files`);
      },
    },
  };
}
