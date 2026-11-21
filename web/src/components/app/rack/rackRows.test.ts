import { describe, expect, it } from 'vitest';
import type { Form } from '../../../lib/api/types';
import { rackRows, rackSubtitle } from './rackRows';

const form = (over: Partial<Form> = {}): Form =>
  ({
    id: 'f1',
    name: 'Contact',
    status: 'active',
    endpoint: 'https://sendm8.com/f/f1',
    endpointBase: 'sendm8.com/f/',
    emailEndpoint: null,
    daily: [],
    monthCount: 0,
    monthlyLimit: 1000,
    lastReceivedAt: null,
    flag: null,
    counts: null,
    ...over,
  }) as Form;

describe('rackRows', () => {
  it('fills in counts, usage and links', () => {
    const rows = rackRows([form({ monthCount: 1234, emailEndpoint: 'https://sendm8.com/f/you@example.com' }), form({ id: 'f2', name: 'Other' })], { f1: { count: 3, more: true } });
    expect(rows[0]).toMatchObject({ unread: 3, unreadLabel: '3+', pct: 100, href: '/app/forms/f1', address: 'you@example.com', idHint: null });
    expect(rows[1]).toMatchObject({ unread: 0, unreadLabel: '', pct: 0, address: null });
  });

  it('tells forms with the same name apart by the end of their id', () => {
    const rows = rackRows([form({ id: 'abcd1234', name: 'Spam QA' }), form({ id: 'wxyz9876', name: 'Spam QA' }), form({ id: 'f3' })], {});
    expect(rows.map((r) => r.idHint)).toEqual(['1234', '9876', null]);
  });
});

describe('rackSubtitle', () => {
  it('counts forms, then unread once it has loaded', () => {
    expect(rackSubtitle(1, {})).toBe('1 form');
    expect(rackSubtitle(3, { a: { count: 2, more: false }, b: { count: 1, more: false } })).toBe('3 forms · 3 unread');
    expect(rackSubtitle(2, { a: { count: 2, more: true } })).toBe('2 forms · 2+ unread');
  });
});
