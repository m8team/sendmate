import { createRouter } from "../app";
import { FORM_ID_PATTERN } from "../lib/ids";

/**
 * The dashboard is a static Astro build, so pages with a form id in the URL can't be pre-rendered
 * per form. web/ builds one shell per page under the placeholder id `_`, and these routes serve it
 * for any real id. The page reads the id from `location.pathname` and loads data from /api.
 */
export const appShellRoutes = createRouter();

export const SHELL_ID = "_";

async function serveShell(c: { env: Env; req: { url: string; param: (name: string) => string } }, path: string) {
  if (!c.env.ASSETS || !FORM_ID_PATTERN.test(c.req.param("formId"))) return null;
  const asset = await c.env.ASSETS.fetch(new URL(path, c.req.url));
  if (!asset.ok) return null;
  const res = new Response(asset.body, asset);
  res.headers.set("cache-control", "no-cache");
  return res;
}

appShellRoutes.get("/:formId", async (c) => (await serveShell(c, `/app/forms/${SHELL_ID}/`)) ?? c.notFound());
appShellRoutes.get("/:formId/settings", async (c) => (await serveShell(c, `/app/forms/${SHELL_ID}/settings/`)) ?? c.notFound());
