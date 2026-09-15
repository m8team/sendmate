import { getDb } from "../db/client";
import { createRouter } from "../app";
import { consumeVerificationToken } from "../email/verification";
import { escapeHtml, parseHttpUrl } from "../lib/http";
import { renderPage, stamp } from "../pages/layout";

export const pageRoutes = createRouter();

pageRoutes.get("/thanks", (c) => {
  const back = parseHttpUrl(c.req.query("back"));
  return renderPage({
    title: "Thanks! Message sent",
    heading: "Got it. Message sent.",
    body: `${stamp("Delivered")}
<p>Thanks for getting in touch. Your message is on its way.</p>
${back ? `<p><a href="${escapeHtml(back.toString())}">← Back to ${escapeHtml(back.hostname)}</a></p>` : ""}`,
  });
});

/**
 * Verification links need a click on a button (POST) so email security scanners that
 * pre-fetch links can't verify addresses on the owner's behalf.
 */
pageRoutes.get("/verify/:token", (c) => {
  const token = c.req.param("token");
  return renderPage({
    title: "Confirm your email",
    heading: "Confirm your email.",
    body: `${stamp("One click")}
<p>Confirm you want sendm8 form notifications at this address.</p>
<form method="POST" action="/verify/${escapeHtml(encodeURIComponent(token))}">
<button type="submit" style="font:700 16px/1 system-ui,sans-serif;padding:14px 22px;background:#141414;color:#f4efe6;border:0;cursor:pointer;">Yep, that's me</button>
</form>`,
  });
});

pageRoutes.post("/verify/:token", async (c) => {
  const address = await consumeVerificationToken(getDb(c.env), c.req.param("token"));
  if (!address) {
    return renderPage({
      status: 400,
      title: "Link expired",
      heading: "That link's gone stale.",
      body: `${stamp("Expired")}<p>Verification links last 24 hours and work once. Send a fresh one from your sendm8 dashboard.</p>`,
    });
  }
  return renderPage({
    title: "Email confirmed",
    heading: "Sorted. You're verified.",
    body: `${stamp("Verified")}<p>Notifications for <strong>${escapeHtml(address.email)}</strong> will start arriving. You can close this tab.</p>`,
  });
});

pageRoutes.get("/health", (c) => c.json({ ok: true }));
