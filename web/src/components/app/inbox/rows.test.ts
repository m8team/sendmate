import { describe, expect, it } from 'vitest';
import type { Delivery, Submission } from '../../../lib/api/types';
import { BULK_RESCUE_MAX, byNewest, plural, rescueMessage, retryMessage, rowChip, stepIndex } from './rows';

const delivery = (status: Delivery['status']): Delivery => ({ channelId: 'c', type: 'email', label: 'Email', status, viaDigest: false, attempts: 1, at: 0 });
const sub = (over: Partial<Submission> = {}): Submission => ({ id: 's1', createdAt: 0, status: 'ok', spamScore: 0.1, deliveries: [], ...over }) as Submission;

describe('rowChip', () => {
  it('shows the most important status first', () => {
    expect(rowChip(sub({ status: 'spam', spamScore: 0.934 }))).toEqual({ text: 'Spam 0.93', cls: 'chip-spam' });
    expect(rowChip(sub({ status: 'held', deliveries: [delivery('failed')] }))).toEqual({ text: 'Held', cls: 'chip-held' });
    expect(rowChip(sub({ status: 'pending_challenge' }))?.text).toBe('Captcha');
    expect(rowChip(sub({ deliveries: [delivery('retrying'), delivery('failed')] }))?.text).toBe('Delivery failed');
    expect(rowChip(sub({ deliveries: [delivery('retrying')] }))?.text).toBe('Retrying');
    expect(rowChip(sub({ deliveries: [delivery('delivered')] }))).toBeNull();
  });
});

describe('byNewest', () => {
  it('orders newest first, then by id', () => {
    const list = [sub({ id: 'a', createdAt: 1 }), sub({ id: 'b', createdAt: 2 }), sub({ id: 'c', createdAt: 1 })];
    expect(list.sort(byNewest).map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('stepIndex', () => {
  const ids = ['a', 'b', 'c'];
  it('moves one step and stops at the ends', () => {
    expect(stepIndex(ids, 'b', 1)).toBe(2);
    expect(stepIndex(ids, 'c', 1)).toBe(2);
    expect(stepIndex(ids, 'a', -1)).toBe(0);
  });
  it('starts at the top going down, or the bottom going up, with nothing active', () => {
    expect(stepIndex(ids, null, 1)).toBe(0);
    expect(stepIndex(ids, 'gone', -1)).toBe(2);
  });
  it('has nowhere to go in an empty list', () => {
    expect(stepIndex([], null, 1)).toBe(-1);
  });
});

describe('messages', () => {
  it('pluralises submissions', () => {
    expect(plural(1)).toBe('1 submission');
    expect(plural(4)).toBe('4 submissions');
  });

  it('explains a bulk rescue', () => {
    expect(rescueMessage(2, 0, '')).toBe('Moved 2 submissions back to the inbox.');
    expect(rescueMessage(1, 1, ' Held ones stay put.')).toBe('Moved 1 submission back to the inbox and queued 1 for delivery. Held ones stay put.');
    expect(rescueMessage(30, 30, '')).toBe(
      `Moved 30 submissions back to the inbox and queued ${BULK_RESCUE_MAX} for delivery. Only ${BULK_RESCUE_MAX} are delivered per go, so the rest stay undelivered.`,
    );
  });

  it('reports a retry', () => {
    expect(retryMessage(0)).toBe('Tried again. Everything went through.');
    expect(retryMessage(1)).toBe('Tried again. 1 delivery still failed.');
    expect(retryMessage(3)).toBe('Tried again. 3 deliveries still failed.');
  });
});
