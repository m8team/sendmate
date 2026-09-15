import { createRouter } from "./app";
import { ensureAppUrl } from "./lib/app-url";
import { handleScheduled } from "./cron";
import { getAuth } from "./auth";
import { ApiError } from "./lib/api-error";
import { renderPage, stamp } from "./pages/layout";
import { apiRoutes } from "./routes/api";
import { appShellRoutes } from "./routes/app-shell";
import { challengeRoutes } from "./routes/challenge";
import { confirmRoutes } from "./routes/confirm";
import { devRoutes } from "./routes/dev";
import { fileRoutes } from "./routes/files";
import { pageRoutes } from "./routes/pages";
import { reportRoutes } from "./routes/report";
import { submitRoutes } from "./routes/submit";

const app = createRouter();

app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth(c.env).handler(c.req.raw));
app.route("/api/dev", devRoutes);
app.route("/api", apiRoutes);
app.route("/f", submitRoutes);
app.route("/c", challengeRoutes);
app.route("/confirm", confirmRoutes);
app.route("/files", fileRoutes);
app.route("/report", reportRoutes);
app.route("/app/forms", appShellRoutes);
app.route("/", pageRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: { code: "not_found", message: "No such endpoint." } }, 404);
  }
  return renderPage({
    status: 404,
    title: "Not found",
    heading: "Return to sender.",
    body: `${stamp("404")}<p>There's nothing at this address.</p>`,
  });
});

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: { code: error.code, message: error.message } }, error.status);
  }
  console.error("unhandled error", error);
  return c.json({ error: { code: "internal_error", message: "Something went wrong." } }, 500);
});

export default {
  async fetch(request, env, ctx) {
    await ensureAppUrl(env, request, ctx);
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller, env) {
    await ensureAppUrl(env);
    await handleScheduled(controller, env);
  },
} satisfies ExportedHandler<Env>;
