// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';

// Static output: deployable to Cloudflare as plain assets.
export default defineConfig({
  site: 'https://sendm8.com',
  output: 'static',
  // The app entrypoint reports Vue component errors to /api/errors.
  integrations: [vue({ appEntrypoint: '/src/vue-app' })],
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
});
