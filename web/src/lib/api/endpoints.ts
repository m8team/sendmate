/** One typed function per API route. Shapes come from @sendm8/shared, the contract. */
import type {
  AdminReportDto,
  AdminUsageDto,
  BlocklistEntryDto,
  BlocklistType,
  BulkAction,
  ChannelDto,
  CreatedChannelDto,
  DailyStat,
  EmailAddressDto,
  EmailSettingsDto,
  ErrorGroupDto,
  FormDto,
  FormSettings,
  FormStatus,
  MeDto,
  Page,
  SubmissionDto,
  SubmissionFilter,
  SubmitFailure,
  SubmitSuccess,
} from '@sendm8/shared';
import { ApiRequestError, apiFetch, request, requestPage } from './client';

const enc = encodeURIComponent;

/** The API accepts up to 100 ids per bulk call. */
export const BULK_MAX = 100;

export interface CreateFormInput {
  name: string;
  allowedOrigins?: string[];
  redirectUrl?: string | null;
  settings?: FormSettings;
}

export interface UpdateFormInput extends Partial<CreateFormInput> {
  status?: Extract<FormStatus, 'active' | 'paused'>;
}

export type CreateChannelInput =
  | { type: 'email'; emailAddressId: string }
  | { type: 'discord'; webhookUrl: string }
  | { type: 'slack'; webhookUrl: string }
  | { type: 'telegram'; botToken: string; chatId: string }
  | { type: 'webhook'; url: string };

export interface ListSubmissionsQuery {
  filter?: SubmissionFilter;
  q?: string;
  cursor?: string | null;
  limit?: number;
}

export const api = {
  // ── Auth ────────────────────────────────────────────────────────────────
  signInSocial: (provider: 'github' | 'google', callbackURL = '/app') =>
    apiFetch('/api/auth/sign-in/social', { method: 'POST', body: { provider, callbackURL } }).then(
      (res) => res.json() as Promise<{ url: string; redirect: boolean }>,
    ),
  signOut: () => apiFetch('/api/auth/sign-out', { method: 'POST', body: {} }).then(() => undefined),
  devLogin: (email = 'dev@sendm8.local') => request<{ userId: string; email: string }>('/api/dev/login', { method: 'POST', body: { email } }),
  me: () => request<MeDto>('/api/me'),
  /** Better Auth's session probe: 200 with `null` when signed out, so it doesn't log a 401. */
  hasSession: () =>
    apiFetch('/api/auth/get-session')
      .then((res) => res.json() as Promise<{ session?: unknown } | null>)
      .then((body) => Boolean(body?.session)),

  /** Posts a submission to a form's public endpoint as an AJAX form would. */
  submit: async (formId: string, data: Record<string, string>) => {
    let res: Response;
    try {
      res = await fetch(`/f/${enc(formId)}`, {
        method: 'POST',
        credentials: 'omit',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch {
      throw new ApiRequestError(0, 'network', 'Couldn’t reach sendm8. Check your connection and try again.');
    }
    const body = (await res.json().catch(() => null)) as SubmitSuccess | SubmitFailure | null;
    if (!res.ok || !body || body.ok !== true) {
      const error = body && body.ok === false ? body.error : null;
      throw new ApiRequestError(res.status, error?.code ?? `http_${res.status}`, error?.message ?? 'The endpoint didn’t accept the test.');
    }
    return body;
  },

  // ── Forms ───────────────────────────────────────────────────────────────
  listForms: () => request<FormDto[]>('/api/forms'),
  getForm: (id: string) => request<FormDto>(`/api/forms/${enc(id)}`),
  createForm: (input: CreateFormInput) => request<FormDto>('/api/forms', { method: 'POST', body: input }),
  updateForm: (id: string, input: UpdateFormInput) => request<FormDto>(`/api/forms/${enc(id)}`, { method: 'PATCH', body: input }),
  deleteForm: (id: string) => request<void>(`/api/forms/${enc(id)}`, { method: 'DELETE' }),
  stats: (id: string, days = 30) => request<DailyStat[]>(`/api/forms/${enc(id)}/stats`, { query: { days } }),
  setTurnstile: (id: string, secretKey: string) =>
    request<{ turnstileConfigured: boolean }>(`/api/forms/${enc(id)}/turnstile`, { method: 'PUT', body: { secretKey } }),
  deleteTurnstile: (id: string) => request<void>(`/api/forms/${enc(id)}/turnstile`, { method: 'DELETE' }),

  // ── Submissions ─────────────────────────────────────────────────────────
  listSubmissions: (formId: string, q: ListSubmissionsQuery = {}) =>
    requestPage<SubmissionDto>(`/api/forms/${enc(formId)}/submissions`, {
      query: { filter: q.filter, q: q.q?.trim(), cursor: q.cursor, limit: q.limit },
    }),
  getSubmission: (id: string) => request<SubmissionDto>(`/api/submissions/${enc(id)}`),
  /** Retries failed and skipped deliveries now. Resolves with the updated submission. */
  retrySubmission: (id: string) => request<SubmissionDto>(`/api/submissions/${enc(id)}/retry`, { method: 'POST' }),
  updateSubmission: (id: string, input: { starred?: boolean; status?: 'ok' | 'spam' }) =>
    request<SubmissionDto>(`/api/submissions/${enc(id)}`, { method: 'PATCH', body: input }),
  deleteSubmission: (id: string) => request<void>(`/api/submissions/${enc(id)}`, { method: 'DELETE' }),
  /** At most 100 ids per call (use `bulkAll` for more). */
  bulk: (formId: string, ids: string[], action: BulkAction, opts: { keepalive?: boolean } = {}) =>
    request<{ affected: number }>(`/api/forms/${enc(formId)}/submissions/bulk`, { method: 'POST', body: { ids, action }, keepalive: opts.keepalive }),
  /** One export page (max 1,000 rows). Use `exportAll` in export.ts to stitch pages. */
  exportPage: (formId: string, format: 'csv' | 'json', filter: SubmissionFilter, cursor?: string | null, q?: string) =>
    apiFetch(`/api/forms/${enc(formId)}/export`, {
      query: { format, filter, q: q?.trim(), cursor },
      headers: { accept: format === 'csv' ? 'text/csv, application/json' : 'application/json' },
    }),

  // ── Channels ────────────────────────────────────────────────────────────
  listChannels: (formId: string) => request<ChannelDto[]>(`/api/forms/${enc(formId)}/channels`),
  createChannel: (formId: string, input: CreateChannelInput, label?: string) =>
    request<CreatedChannelDto>(`/api/forms/${enc(formId)}/channels`, { method: 'POST', body: label?.trim() ? { ...input, label: label.trim() } : input }),
  updateChannel: (id: string, patch: { enabled?: boolean; label?: string }) => request<ChannelDto>(`/api/channels/${enc(id)}`, { method: 'PATCH', body: patch }),
  deleteChannel: (id: string) => request<void>(`/api/channels/${enc(id)}`, { method: 'DELETE' }),
  testChannel: (id: string) => request<{ ok: true }>(`/api/channels/${enc(id)}/test`, { method: 'POST' }),
  rotateSecret: (id: string) => request<CreatedChannelDto>(`/api/channels/${enc(id)}/rotate-secret`, { method: 'POST' }),

  // ── Email addresses & BYOK ─────────────────────────────────────────────
  listEmails: () => request<EmailAddressDto[]>('/api/emails'),
  addEmail: (email: string) => request<EmailAddressDto>('/api/emails', { method: 'POST', body: { email: email.trim() } }),
  resendEmail: (id: string) => request<EmailAddressDto>(`/api/emails/${enc(id)}/resend`, { method: 'POST' }),
  deleteEmail: (id: string) => request<void>(`/api/emails/${enc(id)}`, { method: 'DELETE' }),
  emailSettings: () => request<EmailSettingsDto>('/api/settings/email'),
  putResend: (apiKey: string, from: string) =>
    request<{ keyHint: string; from: string; restricted?: boolean }>('/api/settings/resend', { method: 'PUT', body: { apiKey: apiKey.trim(), from: from.trim() } }),
  deleteResend: () => request<void>('/api/settings/resend', { method: 'DELETE' }),
  /** Changes the sender using the stored key. */
  patchResendFrom: (from: string) => request<{ from: string; restricted?: boolean }>('/api/settings/resend', { method: 'PATCH', body: { from: from.trim() } }),
  /** Verified sending domains for the stored key. 404 `resend_not_configured` without a key. */
  resendDomains: () => request<{ restricted: boolean; domains: string[] }>('/api/settings/resend/domains'),

  // ── Admin (404 for non-admins) ─────────────────────────────────────────
  adminUsage: () => request<AdminUsageDto>('/api/admin/usage'),
  adminErrors: (status: 'open' | 'resolved' | 'all' = 'open') => request<ErrorGroupDto[]>('/api/admin/errors', { query: { status: status === 'open' ? undefined : status } }),
  resolveError: (id: string) => request<{ ok: true }>(`/api/admin/errors/${enc(id)}/resolve`, { method: 'POST' }),
  reopenError: (id: string) => request<{ ok: true }>(`/api/admin/errors/${enc(id)}/reopen`, { method: 'POST' }),
  adminReports: (status: 'open' | 'all' = 'open') => request<AdminReportDto[]>('/api/admin/reports', { query: { status: status === 'all' ? 'all' : undefined } }),
  resolveReport: (id: string) => request<{ ok: true }>(`/api/admin/reports/${enc(id)}/resolve`, { method: 'POST' }),
  disableForm: (id: string, reason: string) => request<{ ok: true }>(`/api/admin/forms/${enc(id)}/disable`, { method: 'POST', body: { reason: reason.trim() } }),
  restoreForm: (id: string) => request<{ ok: true }>(`/api/admin/forms/${enc(id)}/restore`, { method: 'POST' }),
  suspendUser: (id: string, reason: string) => request<{ ok: true }>(`/api/admin/users/${enc(id.trim())}/suspend`, { method: 'POST', body: { reason: reason.trim() } }),
  unsuspendUser: (id: string) => request<{ ok: true }>(`/api/admin/users/${enc(id.trim())}/unsuspend`, { method: 'POST' }),
  blocklist: () => request<BlocklistEntryDto[]>('/api/admin/blocklist'),
  addBlock: (entry: { type: 'ip' | 'ip_hash' | 'email' | 'email_domain'; value: string; reason?: string }) =>
    request<{ type: BlocklistType; value: string }>('/api/admin/blocklist', {
      method: 'POST',
      body: { type: entry.type, value: entry.value.trim(), ...(entry.reason?.trim() && { reason: entry.reason.trim() }) },
    }),
  removeBlock: (entry: { type: BlocklistType; value: string }) => request<void>('/api/admin/blocklist', { method: 'DELETE', body: { type: entry.type, value: entry.value } }),
};

/** Runs a bulk action over any number of ids, 100 at a time. Resolves with the total affected. */
export async function bulkAll(formId: string, ids: string[], action: BulkAction, opts: { keepalive?: boolean } = {}) {
  let affected = 0;
  for (let i = 0; i < ids.length; i += BULK_MAX) {
    affected += (await api.bulk(formId, ids.slice(i, i + BULK_MAX), action, opts)).affected;
  }
  return affected;
}

export type { Page };
