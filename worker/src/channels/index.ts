import type { ChannelType } from "@sendm8/shared";
import type { FormRow, SubmissionRow } from "../db/client";
import { urls } from "../lib/urls";
import { discord } from "./discord";
import { slack } from "./slack";
import { telegram } from "./telegram";
import type { ChannelDriver, Notification, NotificationFile } from "./types";
import { webhook } from "./webhook";

export type ExternalChannelType = Exclude<ChannelType, "email">;

/** Chat and webhook channels. Email is handled separately (budget, BYOK, verified recipients). */
export const drivers: Record<ExternalChannelType, ChannelDriver<any, any>> = { discord, slack, telegram, webhook };

export const isExternalChannel = (type: ChannelType): type is ExternalChannelType => type in drivers;

export function toNotification(env: Env, form: Pick<FormRow, "id" | "name">, submission: Pick<SubmissionRow, "id" | "data" | "meta" | "createdAt">, isTest = false, files: NotificationFile[] = []): Notification {
  const special = submission.meta.special;
  const replyTo = special._replyto ?? (typeof submission.data.email === "string" ? submission.data.email : null);
  return {
    formId: form.id,
    formName: form.name,
    submissionId: submission.id,
    createdAt: submission.createdAt,
    data: submission.data,
    subject: special._subject ?? null,
    replyTo,
    referrer: submission.meta.referrer,
    country: submission.meta.country,
    submissionUrl: urls.submission(env.APP_URL, form.id, submission.id),
    isTest,
    files,
  };
}

export type { Notification };
