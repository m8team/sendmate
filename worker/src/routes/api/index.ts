import type { MeDto } from "@sendm8/shared";
import { eq } from "drizzle-orm";
import { createRouter, isAdmin, requireSameOrigin, requireUser } from "../../app";
import { getLimits } from "../../config";
import { getDb } from "../../db/client";
import { userSettings } from "../../db/schema";
import { captureError } from "../../ops/errors";
import { claimFormsForUser, deliverBacklog } from "../../pipeline/zero-signup";
import { adminRoutes } from "./admin";
import { channelRoutes } from "./channels";
import { emailRoutes } from "./emails";
import { formRoutes } from "./forms";
import { settingsRoutes } from "./settings";
import { submissionRoutes } from "./submissions";

export const apiRoutes = createRouter();

apiRoutes.use("*", requireSameOrigin, requireUser);

apiRoutes.get("/me", async (c) => {
  const user = c.get("user");
  // Picks up any zero-signup forms sent to this user's verified email (or a +tag of it), and
  // delivers what was waiting on the ones that were still pending.
  const { reopened } = await claimFormsForUser(c.env, user);
  if (reopened.length) {
    c.executionCtx.waitUntil(deliverBacklog(c.env, reopened).catch((error) => captureError(c.env, error, { where: "backlog delivery" })));
  }
  const limits = getLimits(c.env);
  const settings = await getDb(c.env).select({ heardFrom: userSettings.heardFrom }).from(userSettings).where(eq(userSettings.userId, user.id)).get();
  const body: MeDto = {
    user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null },
    limits,
    heardFrom: (settings?.heardFrom as MeDto["heardFrom"]) ?? null,
    isAdmin: isAdmin(c.env, user),
  };
  return c.json({ data: body });
});

apiRoutes.route("/admin", adminRoutes);
apiRoutes.route("/forms", formRoutes);
apiRoutes.route("/emails", emailRoutes);
apiRoutes.route("/settings", settingsRoutes);
apiRoutes.route("/", submissionRoutes);
apiRoutes.route("/", channelRoutes);
