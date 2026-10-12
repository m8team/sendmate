/**
 * Deploys the Worker with its database migrations in a safe order.
 *
 * Migrations run *before* the deploy, because they only ever add things: old code works on the new
 * schema, but new code on the old schema breaks (a new column read by /api/me would fail every page).
 * On a brand-new install the database doesn't exist until `wrangler deploy` creates it, so then the
 * migrations run after instead. Running them twice is harmless; the second run finds nothing to do.
 *
 *   node scripts/deploy.mjs [--domain example.com] [--dry-run]
 */
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const domainAt = args.indexOf("--domain");
const domain = domainAt >= 0 ? args[domainAt + 1] : undefined;

function run(command) {
  console.log(`\n$ ${command}`);
  if (!dryRun) execSync(command, { stdio: "inherit" });
}

function databaseExists() {
  try {
    execSync("npx wrangler d1 migrations list DB --remote", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const exists = databaseExists();
console.log(exists ? "Database found: migrating before the deploy." : "No database yet: the deploy creates it, then migrations run.");

if (exists) run("npx wrangler d1 migrations apply DB --remote");
run(`npx wrangler deploy${domain ? ` --domain ${domain}` : ""}`);
// A no-op when the step above already ran; on a fresh install this is where the tables are created.
run("npx wrangler d1 migrations apply DB --remote");
