import type { App } from 'vue';
import { reportError } from './lib/error-reporter';

/** Runs for every Vue island Astro mounts (astro.config.mjs → appEntrypoint). */
export default (app: App) => {
  app.config.errorHandler = (error, instance, info) => {
    // Setting a handler stops Vue logging the error, so log it here.
    console.error(error);
    reportError(error, { kind: 'vue', component: instance?.$options.name ?? instance?.$options.__name, info });
  };
};
