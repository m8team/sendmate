// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import llmsDocs from './src/integrations/llms-docs.ts';

// Static output: deployable to Cloudflare as plain assets.
export default defineConfig({
  site: 'https://sendm8.com',
  output: 'static',
  // The app entrypoint reports Vue component errors to /api/errors.
  // llmsDocs publishes /docs as Markdown for AI assistants (/llms.txt) after the build.
  integrations: [vue({ appEntrypoint: '/src/vue-app' }), llmsDocs()],
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
});
