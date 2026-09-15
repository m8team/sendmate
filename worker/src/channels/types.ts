import type { FieldValue } from "@sendm8/shared";
import type { z } from "zod";
import type { ChannelResult } from "./http";

/** Everything a chat/webhook channel needs to render one submission. */
export interface Notification {
  formId: string;
  formName: string;
  submissionId: string;
  createdAt: number;
  data: Record<string, FieldValue>;
  subject: string | null;
  replyTo: string | null;
  referrer: string | null;
  country: string | null;
  submissionUrl: string;
  isTest: boolean;
  /** Uploaded files with signed, expiring download links. */
  files: NotificationFile[];
}

export interface NotificationFile {
  field: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export interface DriverContext {
  env: Env;
}

export type Prepared<Config> = { ok: true; config: Config; label: string; secret?: string } | { ok: false; error: string };

export interface ChannelDriver<Schema extends z.ZodType, Config> {
  /** Validates the create request body (including its `type` literal). */
  inputSchema: Schema;
  /** Checks the destination works and builds the stored (encrypted) config plus a display label. */
  prepare(input: z.infer<Schema>, ctx: DriverContext): Promise<Prepared<Config>>;
  send(config: Config, notification: Notification, ctx: DriverContext): Promise<ChannelResult>;
  /** Used to reject duplicate channels on the same form. */
  sameDestination(a: Config, b: Config): boolean;
}

export const valueText = (value: FieldValue) => (Array.isArray(value) ? value.join(", ") : value);

export const notificationTitle = (n: Notification) => `${n.isTest ? "[Test] " : ""}${n.subject || `New submission: ${n.formName}`}`.replace(/[\r\n]+/g, " ");
