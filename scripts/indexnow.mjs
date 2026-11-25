/**
 * Tells Bing (and the other IndexNow engines) which pages changed, right after a deploy, instead of
 * waiting for the next crawl. ChatGPT's search leans on Bing, so new guides get found sooner.
 *
 * It reads the built sitemap and the key file (web/public/indexnow.txt, served at /indexnow.txt)
 * and submits the pages whose lastmod is recent. A copy without the key file does nothing.
 * It never fails a deploy: errors are logged and ignored.
 *
 *   node scripts/indexnow.mjs [--days 3] [--dry-run]
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../web/dist/", import.meta.url));

/** Pages from sitemap XML whose lastmod is on or after `since` (ms). Pages without a lastmod count as changed. */
export function recentUrls(sitemapXml, since) {
  const urls = [];
  for (const [, entry] of sitemapXml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!loc) continue;
    const lastmod = entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    if (!lastmod || Date.parse(lastmod) >= since) urls.push(loc);
  }
  return urls;
}

/** The IndexNow request body for one host. */
export function indexNowBody(urls, key) {
  const host = new URL(urls[0]).host;
  return {
    host,
    key,
    keyLocation: `https://${host}/indexnow.txt`,
    urlList: urls.filter((u) => new URL(u).host === host).slice(0, 10_000),
  };
}

export async function submitRecent({ days = 3, dryRun = false, now = Date.now(), fetchImpl = fetch, dist = DIST } = {}) {
  const keyFile = `${dist}indexnow.txt`;
  const sitemapFile = `${dist}sitemap-0.xml`;
  if (!existsSync(keyFile) || !existsSync(sitemapFile)) {
    console.log("IndexNow: no key file or sitemap in web/dist, skipping.");
    return { submitted: 0 };
  }
  const key = readFileSync(keyFile, "utf8").trim();
  const urls = recentUrls(readFileSync(sitemapFile, "utf8"), now - days * 86_400_000);
  if (urls.length === 0) {
    console.log(`IndexNow: nothing changed in the last ${days} days.`);
    return { submitted: 0 };
  }
  const body = indexNowBody(urls, key);
  console.log(`IndexNow: ${body.urlList.length} page(s) on ${body.host}${dryRun ? " (dry run)" : ""}`);
  if (dryRun) return { submitted: 0, body };
  try {
    const res = await fetchImpl("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    // 200 and 202 both mean accepted; anything else is logged and the deploy carries on.
    console.log(`IndexNow: ${res.status}`);
    return { submitted: res.ok ? body.urlList.length : 0, status: res.status };
  } catch (error) {
    console.log(`IndexNow: failed (${error.message}), skipping.`);
    return { submitted: 0 };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const daysAt = args.indexOf("--days");
  await submitRecent({ days: daysAt >= 0 ? Number(args[daysAt + 1]) : 3, dryRun: args.includes("--dry-run") });
}
