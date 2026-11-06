import type { EmailAddressDto } from '@sendm8/shared';
import { describe, expect, it, vi } from 'vitest';
import { addFormAddress } from './otherAddress';

const dto = (email: string, verified: boolean) => ({ id: 'a1', email, verified }) as EmailAddressDto;

describe('adding the address a form sends to', () => {
  it('asks for a real address before calling the API', async () => {
    const add = vi.fn();
    expect(await addFormAddress('  not-an-email ', add)).toEqual({ kind: 'invalid', message: 'Enter the email address your form sends to.' });
    expect(add).not.toHaveBeenCalled();
  });

  it('says a link was sent when the address still needs verifying', async () => {
    const add = vi.fn(async (email: string) => dto(email, false));
    expect(await addFormAddress(' hello@ramenrun.org ', add)).toEqual({ kind: 'sent', email: 'hello@ramenrun.org' });
    expect(add).toHaveBeenCalledWith('hello@ramenrun.org');
  });

  it('reloads straight away when the address is already verified', async () => {
    expect(await addFormAddress('me@site.dev', async (email) => dto(email, true))).toEqual({ kind: 'claimed' });
  });

  it('lets API errors through for the card to show', async () => {
    await expect(addFormAddress('a@b.co', async () => Promise.reject(new Error('limit')))).rejects.toThrow('limit');
  });
});
