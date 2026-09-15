/** Mock shapes for the static demo pages. The real API types live in packages/shared/src/types.ts. */

export type FormStatus = 'active' | 'paused' | 'pending_confirmation' | 'disabled';
export type SubmissionStatus = 'ok' | 'spam' | 'held' | 'pending_challenge';
export type ChannelType = 'email' | 'discord' | 'slack' | 'telegram' | 'webhook';
export type DeliveryStatus = 'delivered' | 'failed' | 'retrying' | 'digest' | 'skipped';

export interface Form {
  id: string;
  name: string;
  status: FormStatus;
  createdAt: string;
  allowedOrigins: string[];
  redirectUrl: string | null;
  notify: 'instant' | 'digest';
  honeypotField: string;
  turnstile: 'off' | 'challenge' | 'byo';
  aiSpamScoring: boolean;
  /** Daily submission counts, oldest first, last 30 days */
  daily: number[];
  monthCount: number;
  totalCount: number;
  spamCount: number;
  lastReceivedAt: string | null;
  fieldNames: string[];
  flag?: 'phishing_review';
}

export interface Channel {
  id: string;
  formId: string;
  type: ChannelType;
  label: string;
  /** Display-only, already masked */
  target: string;
  enabled: boolean;
  lastTest?: { at: string; ok: boolean; message: string };
}

export interface Delivery {
  channelId: string;
  type: ChannelType;
  target: string;
  status: DeliveryStatus;
  attempts: number;
  at: string;
  error?: string;
  nextRetryAt?: string;
}

export interface SubmissionFile {
  field: string;
  name: string;
  sizeKb: number;
  type: string;
}

export interface Submission {
  id: string;
  formId: string;
  tracking: string;
  createdAt: string;
  data: Record<string, string>;
  files: SubmissionFile[];
  meta: { country: string; countryName: string; userAgent: string; referrer: string; ipHash: string };
  spamScore: number;
  spamReasons: string[];
  status: SubmissionStatus;
  starred: boolean;
  read: boolean;
  deliveries: Delivery[];
}

export interface Account {
  name: string;
  email: string;
  initials: string;
  provider: 'github' | 'google';
  handle: string;
  joinedAt: string;
  resend: {
    connected: boolean;
    maskedKey: string | null;
    fromAddress: string | null;
    verifiedAt: string | null;
    domains: string[];
  };
  usage: {
    instantEmailsToday: number;
    submissionsThisMonth: number;
    digestQueued: number;
  };
  verifiedEmails: { email: string; verifiedAt: string | null }[];
}
