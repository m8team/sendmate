import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "../wrangler.jsonc" },
      miniflare: {
        r2Buckets: ["FILES"],
        bindings: {
          ALERT_WEBHOOK_URL: "https://alerts.example.com/hook",
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
          APP_URL: "https://sendm8.test",
          BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
          IP_HASH_SECRET: "test-ip-secret",
          ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
          GITHUB_CLIENT_ID: "test",
          GITHUB_CLIENT_SECRET: "test",
          GOOGLE_CLIENT_ID: "",
          GOOGLE_CLIENT_SECRET: "",
          RESEND_API_KEY: "re_system_test",
          EMAIL_FROM: "sendm8 <notify@sendm8.test>",
          TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
          TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
          ADMIN_EMAILS: "boss@sendm8.test, Second@Sendm8.test",
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
    coverage: {
      // V8 coverage isn't available inside workerd, so instrument with istanbul.
      provider: "istanbul",
      include: ["src/**/*.ts", "../packages/shared/src/**/*.ts"],
      exclude: ["src/db/schema.ts"],
      reporter: ["text-summary", "text", "html"],
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 70 },
    },
  },
});
