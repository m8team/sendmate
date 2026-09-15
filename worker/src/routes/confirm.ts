import { createRouter } from "../app";
import { getDb } from "../db/client";
import { findByToken } from "../email/verification";
import { escapeHtml } from "../lib/http";
import { urls } from "../lib/urls";
import { renderPage, stamp } from "../pages/layout";
import { confirmZeroSignup, declineZeroSignup, deliverBacklog } from "../pipeline/zero-signup";
import { captureError } from "../ops/errors";

export const confirmRoutes = createRouter();

const button = (label: string, value: string, primary: boolean) =>
  `<button type="submit" name="action" value="${value}" style="font:700 16px/1 system-ui,sans-serif;padding:14px 22px;margin:0 12px 12px 0;cursor:pointer;${
    primary ? "background:#141414;color:#f4efe6;border:2px solid #141414" : "background:transparent;color:inherit;border:2px solid currentColor"
  }">${label}</button>`;

function expired() {
  return renderPage({
    status: 400,
    title: "Link expired",
    heading: "That link's gone stale.",
    body: `${stamp("Expired")}<p>Confirmation links last 24 hours and work once. A fresh one is sent with the next submission.</p>`,
  });
}

/** Like /verify, this needs a click (POST) so link scanners can't confirm or decline on someone's behalf. */
confirmRoutes.get("/:token", async (c) => {
  const token = c.req.param("token");
  const address = await findByToken(getDb(c.env), token);
  if (!address || address.userId !== null) return expired();
  return renderPage({
    title: "Confirm form submissions",
    heading: "Deliver these to you?",
    body: `${stamp("Waiting")}
<p>A website form wants to send its submissions to <strong>${escapeHtml(address.email)}</strong>.</p>
<form method="POST" action="/confirm/${escapeHtml(encodeURIComponent(token))}">
${button("Yes, deliver them", "confirm", true)}${button("Not me, stop it", "decline", false)}
</form>`,
  });
});

confirmRoutes.post("/:token", async (c) => {
  const token = c.req.param("token");
  const body = await c.req.parseBody();

  if (body.action === "decline") {
    const declined = await declineZeroSignup(c.env, token);
    if (!declined) return expired();
    return renderPage({
      title: "Stopped",
      heading: "Done. It's stopped.",
      body: `${stamp("Return to sender")}<p>That form can't send anything to <strong>${escapeHtml(declined.email)}</strong> and we won't email you about it again. Waiting messages were deleted.</p>`,
    });
  }

  const confirmed = await confirmZeroSignup(c.env, token);
  if (!confirmed) return expired();
  c.executionCtx.waitUntil(deliverBacklog(c.env, confirmed.formIds).catch((error) => captureError(c.env, error, { where: "backlog delivery" })));
  return renderPage({
    title: "Confirmed",
    heading: "Sorted. Mail's on its way.",
    body: `${stamp("Delivered")}<p>Submissions will now arrive at <strong>${escapeHtml(confirmed.email)}</strong>, starting with any that were waiting.</p>
<p>Want an inbox, spam filtering, Discord or Slack alerts? <a href="${escapeHtml(urls.signIn(c.env.APP_URL))}">Sign in with this email</a> and the form is yours. It's free.</p>`,
  });
});
