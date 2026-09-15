/**
 * Thin fetch wrapper for the sendm8 API. The dashboard is served from the same origin as the
 * Worker, so cookies and the Origin header (CSRF check) come for free with same-origin fetch.
 *
 * Every response is `{ data }`, `{ data, nextCursor }` or `{ error: { code, message } }`.
 */
import type { Page } from '@sendm8/shared';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

export const isApiError = (err: unknown): err is ApiRequestError => err instanceof ApiRequestError;

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** Extra headers, e.g. `accept` for exports. */
  headers?: Record<string, string>;
  /** Let the request finish even if the page is being closed. */
  keepalive?: boolean;
}

type UnauthorizedHandler = (err: ApiRequestError) => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Called on any 401, e.g. to send the user back to sign-in. Pass null to clear. */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  unauthorizedHandler = fn;
}

export function buildUrl(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path;
}

async function errorFrom(res: Response): Promise<ApiRequestError> {
  let code = `http_${res.status}`;
  let message = res.status >= 500 ? 'Something went wrong on our end. Try again in a moment.' : 'That didn’t work. Try again.';
  try {
    // Our API sends { error: { code, message } }; Better Auth (/api/auth/*) sends { code, message }.
    const body = (await res.json()) as { error?: { code?: string; message?: string }; code?: string; message?: string };
    const detail = body?.error ?? body;
    if (typeof detail?.code === 'string' && detail.code) code = detail.code;
    if (typeof detail?.message === 'string' && detail.message) message = detail.message;
  } catch {
    /* not JSON: keep the generic message */
  }
  return new ApiRequestError(res.status, code, message);
}

/** Low-level request. Resolves with the Response when it's 2xx, throws ApiRequestError otherwise. */
export async function apiFetch(path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json', ...opts.headers };
  const init: RequestInit = { method: opts.method ?? 'GET', credentials: 'same-origin', headers, signal: opts.signal };
  if (opts.keepalive) init.keepalive = true;
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), init);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiRequestError(0, 'network', 'Couldn’t reach sendm8. Check your connection and try again.');
  }
  if (!res.ok) {
    const error = await errorFrom(res);
    if (error.status === 401) unauthorizedHandler?.(error);
    throw error;
  }
  return res;
}

async function readJson<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiRequestError(res.status, 'bad_response', 'The server sent something we didn’t understand. Try again.');
  }
}

/** Request that unwraps `{ data }`. 204 responses resolve with `undefined`. */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const body = await readJson<{ data: T } | undefined>(await apiFetch(path, opts));
  return (body?.data ?? undefined) as T;
}

/** Request for cursor-paged lists: resolves with `{ data, nextCursor }`. */
export async function requestPage<T>(path: string, opts: RequestOptions = {}): Promise<Page<T>> {
  const body = await readJson<Page<T> | undefined>(await apiFetch(path, opts));
  return { data: body?.data ?? [], nextCursor: body?.nextCursor ?? null };
}
