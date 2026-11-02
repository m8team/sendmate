import { describe, expect, it } from 'vitest';
import {
  addressFor,
  endpointFor,
  isEmail,
  PLACEHOLDER_EMAIL,
  replyToFor,
  rowsFor,
  snippetFor,
  titleFor,
  webhookBody,
} from './previewLogic';

const base = 'https://sendm8.com/f/';
const sam = { name: 'Sam Taylor', email: 'sam@example.com', message: 'Hi!' };

describe('endpoint line', () => {
  it('uses the placeholder until they type', () => {
    expect(addressFor('')).toBe(PLACEHOLDER_EMAIL);
    expect(addressFor('   ')).toBe(PLACEHOLDER_EMAIL);
  });

  it('follows what they type, trimmed', () => {
    expect(endpointFor(base, ' jo@studio.dev ')).toBe('https://sendm8.com/f/jo@studio.dev');
    expect(snippetFor(base, 'jo@studio.dev')).toBe('<form action="https://sendm8.com/f/jo@studio.dev" method="POST">');
  });
});

describe('isEmail', () => {
  it('accepts plain addresses and rejects partial ones', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('not an email')).toBe(false);
  });
});

describe('rows and titles', () => {
  it('keeps every field in form order, empty ones included', () => {
    expect(rowsFor({ name: ' Sam ', email: '', message: 'Hi' })).toEqual([
      { name: 'name', value: 'Sam' },
      { name: 'email', value: '' },
      { name: 'message', value: 'Hi' },
    ]);
  });

  it('matches the Worker’s default subject', () => {
    expect(titleFor()).toBe('New submission: Contact');
    expect(titleFor('Quotes')).toBe('New submission: Quotes');
  });

  it('only sets Reply-To for a real address', () => {
    expect(replyToFor(sam)).toBe('sam@example.com');
    expect(replyToFor({ ...sam, email: 'sam@' })).toBeNull();
  });
});

describe('webhookBody', () => {
  it('has the documented shape', () => {
    const body = JSON.parse(webhookBody(sam, { id: 'sub_1', createdAt: '2026-11-02T10:00:00.000Z', referrer: 'https://yoursite.com/contact' }));
    expect(body.event).toBe('submission.created');
    expect(body.form).toEqual({ id: 'k3x9q2m7ab', name: 'Contact' });
    expect(body.submission).toMatchObject({
      id: 'sub_1',
      data: { name: 'Sam Taylor', email: 'sam@example.com', message: 'Hi!' },
      subject: null,
      replyTo: 'sam@example.com',
      referrer: 'https://yoursite.com/contact',
    });
  });
});
