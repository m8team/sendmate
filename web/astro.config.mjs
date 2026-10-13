// @ts-check
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import sitemap from '@astrojs/sitemap';
import llmsDocs from './src/integrations/llms-docs.ts';

import { createLastmod, gitDates, isIndexable } from './src/lib/sitemap.ts';
import { changelog } from './src/config/changelog.ts';

// Noindex routes (src/lib/sitemap.ts) are kept out of the sitemap too, since there's no point pointing
// crawlers at an entry that just tells them not to index it. They're NOT in robots.txt: a public
// Disallow is a signpost to attackers, and it would also stop crawlers from ever reading the noindex
// tag in the first place. Rely on noindex instead.
const lastmod = createLastmod(
  {
    changelogDate: changelog[0].date,
    legal: {
      privacy: readFileSync(new URL('../docs/legal/privacy.md', import.meta.url), 'utf8'),
      terms: readFileSync(new URL('../docs/legal/terms.md', import.meta.url), 'utf8'),
    },
  },
  gitDates(fileURLToPath(new URL('..', import.meta.url)), { unshallow: true }),
);

// Static output: deployable to Cloudflare as plain assets.
export default defineConfig({
  site: 'https://sendm8.com',
  output: 'static',
  // The app entrypoint reports Vue component errors to /api/errors.
  // llmsDocs publishes /docs as Markdown for AI assistants (/llms.txt) after the build.
  integrations: [
    vue({ appEntrypoint: '/src/vue-app' }),
    llmsDocs(),
    sitemap({
      filter: (page) => isIndexable(new URL(page).pathname),
      serialize: (item) => {
        const date = lastmod(item.url);
        return date ? { ...item, lastmod: date } : item;
      },
      // Only plain <url> entries are used, so don't declare the news/image/video/hreflang extensions.
      namespaces: { news: false, xhtml: false, image: false, video: false },
    }),
  ],
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
});
