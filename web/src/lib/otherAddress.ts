import type { EmailAddressDto } from '@sendm8/shared';

/** What happened when someone added the address their form sends to (see OtherAddressCard.vue). */
export type AddAddressResult =
  | { kind: 'invalid'; message: string }
  /** Already verified: reloading the dashboard claims its forms. */
  | { kind: 'claimed' }
  /** A verification link went to the address; its forms move in once it's clicked. */
  | { kind: 'sent'; email: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addFormAddress(input: string, add: (email: string) => Promise<EmailAddressDto>): Promise<AddAddressResult> {
  const email = input.trim();
  if (!EMAIL.test(email)) return { kind: 'invalid', message: 'Enter the email address your form sends to.' };
  const added = await add(email);
  return added.verified ? { kind: 'claimed' } : { kind: 'sent', email: added.email };
}
