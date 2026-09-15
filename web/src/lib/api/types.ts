/**
 * View models the dashboard components render. The API DTOs (@sendm8/shared) are mapped into
 * these by adapters.ts, so components don't have to know about wire formats.
 */
import type { ChannelTestResult, ChannelType, FieldValue, FolderCounts, FormStatus, SubmissionStatus } from '@sendm8/shared';

export type { ChannelTestResult, ChannelType, FolderCounts, FormStatus, SubmissionStatus };

export type NotifyMode = 'instant' | 'digest' | 'off';
export type ChallengeMode = 'off' | 'suspicious' | 'always';
/** What the Spam tab shows: sendm8's challenge page (when suspicious / always), the form's own widget, or off. */
export type TurnstileMode = 'off' | 'challenge' | 'always' | 'byo';

export interface Form {
  id: string;
  name: string;
  status: FormStatus;
  createdAt: number;
  /** Full endpoint URL, e.g. https://sendm8.com/f/k3x9q2m7ab */
  endpoint: string;
  /** Everything before the id, without the protocol, e.g. sendm8.com/f/ */
  endpointBase: string;
  /** `/f/you@example.com` style endpoint, for forms that started as zero-signup. */
  emailEndpoint: string | null;
  allowedOrigins: string[];
  redirectUrl: string | null;
  notify: NotifyMode;
  challenge: ChallengeMode;
  turnstile: TurnstileMode;
  turnstileConfigured: boolean;
  /** Custom honeypot name, or '' when only the built-in `_gotcha` / `_honeypot` are used. */
  honeypotField: string;
  strictOrigin: boolean;
  /** Workers AI double-check on submissions that passed the heuristics. */
  aiSpamScoring: boolean;
  /** Daily submission counts, oldest first. Empty until stats have loaded. */
  daily: number[];
  monthCount: number;
  monthlyLimit: number;
  lastReceivedAt: number | null;
  /** Why the form was flagged for review, if it was. */
  flag: string | null;
  /** Folder counts. Only `GET /api/forms/:id` sends them, so null for forms from the list. */
  counts: FolderCounts | null;
}

export interface Channel {
  id: string;
  formId: string;
  type: ChannelType;
  label: string;
  enabled: boolean;
  createdAt: number;
  /** Email channels only. */
  recipientVerified?: boolean;
  /** The most recent "Send test", saved by the API. */
  lastTest: ChannelTestResult | null;
}

/**
 * delivered: sent (instantly, or in a digest when `viaDigest`)
 * retrying:  failed, will retry automatically
 * digest:    queued for the next digest
 * failed:    permanently not delivered (see `error`)
 */
export type DeliveryState = 'delivered' | 'retrying' | 'digest' | 'failed';

export interface Delivery {
  channelId: string;
  /** null when the channel has since been removed. */
  type: ChannelType | null;
  label: string;
  status: DeliveryState;
  viaDigest: boolean;
  attempts: number;
  at: number;
  error?: string;
}

export interface SubmissionFile {
  id: string;
  field: string;
  name: string;
  /** Bytes. */
  size: number;
  type: string;
  url: string;
}

export interface Submission {
  id: string;
  formId: string;
  tracking: string;
  createdAt: number;
  /** Field values as display text (multi-value fields joined with ", "). */
  data: Record<string, string>;
  /** Field values exactly as the API sent them. */
  raw: Record<string, FieldValue>;
  special: Record<string, string>;
  files: SubmissionFile[];
  droppedFiles: string[];
  meta: {
    country: string | null;
    countryName: string | null;
    userAgent: string | null;
    browser: string | null;
    referrer: string | null;
  };
  spamScore: number;
  spamReasons: string[];
  status: SubmissionStatus;
  starred: boolean;
  /** Kept per browser in localStorage: the API has no read state. */
  read: boolean;
  deliveries: Delivery[];
  /** When failed deliveries will next be retried automatically, if any. */
  retryAt: number | null;
}
