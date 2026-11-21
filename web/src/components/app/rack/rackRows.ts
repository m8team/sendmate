/** Pure view logic for the forms list (/app): one row per form, and the unread total for the page header. */
import type { Form } from '../../../lib/api/types';
import { emailAddressOf, usagePct } from '../inbox/formStatus';

export interface UnreadCount {
  count: number;
  more: boolean;
}

export interface RackRow {
  f: Form;
  unread: number;
  /** "3", "100+", or '' until the count has loaded. */
  unreadLabel: string;
  pct: number;
  href: string;
  address: string | null;
  /** The end of the id, shown when another form has the same name. */
  idHint: string | null;
}

export const fmtN = (n: number) => n.toLocaleString('en-GB');

export function rackRows(forms: Form[], unread: Record<string, UnreadCount>): RackRow[] {
  const names = new Map<string, number>();
  for (const f of forms) names.set(f.name, (names.get(f.name) ?? 0) + 1);
  return forms.map((f) => {
    const u = unread[f.id];
    return {
      f,
      unread: u?.count ?? 0,
      unreadLabel: u ? `${u.count}${u.more ? '+' : ''}` : '',
      pct: usagePct(f.monthCount, f.monthlyLimit),
      href: `/app/forms/${f.id}`,
      address: emailAddressOf(f.emailEndpoint) ?? null,
      idHint: (names.get(f.name) ?? 0) > 1 ? f.id.slice(-4) : null,
    };
  });
}

/** "7 forms · 25 unread", once the counts are in. */
export function rackSubtitle(formCount: number, unread: Record<string, UnreadCount>) {
  const forms = formCount === 1 ? '1 form' : `${formCount} forms`;
  const counts = Object.values(unread);
  if (!counts.length) return forms;
  const total = counts.reduce((sum, u) => sum + u.count, 0);
  return `${forms} · ${total}${counts.some((u) => u.more) ? '+' : ''} unread`;
}
