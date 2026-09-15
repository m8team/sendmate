import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../client';
import { errorCode, fieldError, friendlyError, splitValidation } from '../errors';

const err = (code: string, message = '', status = 400) => new ApiRequestError(status, code, message);

describe('splitValidation', () => {
  it('splits a field path from the message and tidies it into a sentence', () => {
    expect(splitValidation('webhookUrl: must be a Discord webhook URL')).toEqual({ field: 'webhookUrl', message: 'Must be a Discord webhook URL.' });
    expect(splitValidation('settings.honeypotField: must start with a letter')).toEqual({ field: 'settings.honeypotField', message: 'Must start with a letter.' });
  });

  it('keeps messages without a field, and existing punctuation', () => {
    expect(splitValidation('Invalid request.')).toEqual({ field: null, message: 'Invalid request.' });
    expect(splitValidation('')).toEqual({ field: null, message: '' });
  });
});

describe('friendlyError', () => {
  it('uses our copy for known codes', () => {
    expect(friendlyError(err('resend_cooldown', 'We just sent one.', 429))).toMatch(/We just sent one/);
    expect(friendlyError(err('network', 'x', 0))).toMatch(/Couldn’t reach sendm8/);
    expect(friendlyError(err('held_for_review'))).toMatch(/Held submissions/);
  });

  it('passes through messages that carry the destination’s detail', () => {
    expect(friendlyError(err('test_failed', "The test didn't go through: 404 Unknown Webhook", 502))).toBe("The test didn't go through: 404 Unknown Webhook.");
    expect(friendlyError(err('resend_key_invalid', 'API key is invalid'))).toBe('API key is invalid.');
  });

  it('strips the field from validation errors', () => {
    expect(friendlyError(err('validation_failed', 'name: Too small: expected string to have >=1 characters', 422))).toBe(
      'Too small: expected string to have >=1 characters.',
    );
  });

  it('falls back to the API message, then to a generic one', () => {
    expect(friendlyError(err('something_new', 'a brand new thing happened'))).toBe('A brand new thing happened.');
    expect(friendlyError(err('something_new', ''))).toBe('Something went wrong. Try again.');
    expect(friendlyError(new Error('boom'))).toBe('Something went wrong. Try again.');
  });
});

describe('fieldError & errorCode', () => {
  it('returns the field for validation errors', () => {
    expect(fieldError(err('validation_failed', 'redirectUrl: Invalid URL', 422))).toEqual({ field: 'redirectUrl', message: 'Invalid URL.' });
  });

  it('has no field for other errors', () => {
    expect(fieldError(err('channel_exists', 'x', 409))).toEqual({ field: null, message: 'This form already sends there.' });
  });

  it('reads the code only from API errors', () => {
    expect(errorCode(err('email_exists'))).toBe('email_exists');
    expect(errorCode(new Error('x'))).toBeNull();
  });
});
