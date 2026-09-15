// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';

// Static output: deployable to Cloudflare as plain assets.
export default defineConfig({
  site: 'https://sendm8.com',
  output: 'static',
  integrations: [vue()],
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
});
