import { eq } from "drizzle-orm";
import { createRouter } from "../app";
import { getDb } from "../db/client";
import { forms, submissions } from "../db/schema";
import { fileResponse, verifyFileToken } from "../files/storage";
import { renderPage, stamp } from "../pages/layout";

/** Signed, expiring download links used in notification emails, chat messages and webhooks. */
export const fileRoutes = createRouter();

const gone = () =>
  renderPage({
    status: 404,
    title: "File unavailable",
    heading: "That file's not here.",
    body: `${stamp("Return to sender")}<p>The link has expired or the file was deleted. Signed-in owners can still download it from the dashboard.</p>`,
  });

fileRoutes.get("/:token", async (c) => {
  const claims = await verifyFileToken(c.env, c.req.param("token"));
  if (!claims || !c.env.FILES) return gone();

  const row = await getDb(c.env)
    .select({ submission: submissions, formStatus: forms.status })
    .from(submissions)
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(eq(submissions.id, claims.submissionId))
    .get();
  if (!row || row.submission.status === "held" || row.formStatus === "disabled") return gone();

  const file = row.submission.meta.files?.find((f) => f.id === claims.fileId);
  const object = file && (await c.env.FILES.get(file.key));
  if (!file || !object) return gone();
  return fileResponse(object, file);
});
