// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import sitemap from '@astrojs/sitemap';
import llmsDocs from './src/integrations/llms-docs.ts';

// Routes that carry <meta name="robots" content="noindex"> (see src/layouts/{App,System}.astro,
// and the two Marketing pages that pass noindex explicitly). Kept out of the sitemap too, since
// there's no point pointing crawlers at a sitemap entry that just tells them not to index it.
// This list is NOT in robots.txt: a public Disallow is a signpost to attackers, and it would also
// stop crawlers from ever reading the noindex tag in the first place. Rely on noindex instead.
const NOINDEX_PREFIXES = ['/app', '/pages', '/confirm', '/blocked', '/thanks', '/c', '/404'];

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
      filter: (page) => {
        const path = new URL(page).pathname;
        return !NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
      },
    }),
  ],
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
});
