/**
 * The bottom of the rail (AppRail.astro): who's signed in, today's email meter, the admin link and sign out.
 */
import type { MeDto } from '@sendm8/shared';
import { api } from '../../../lib/api/endpoints';
import { initials } from '../../../lib/api/session';
import { invalidate, loadEmailSettings, loadIsAdmin } from '../../../lib/api/store';
import { usageReading } from './railFormat';

export function mountAccount() {
  async function refreshUsage() {
    const count = document.querySelector<HTMLElement>('[data-usage-count]')!;
    const meter = document.querySelector<HTMLElement>('[data-usage-meter]')!;
    try {
      const reading = usageReading(await loadEmailSettings());
      count.textContent = reading.text;
      meter.style.setProperty('--pct', `${reading.pct}%`);
      if (reading.high !== null) meter.classList.toggle('is-high', reading.high);
    } catch {
      count.textContent = '–';
    }
  }

  function show(me: MeDto) {
    const avatar = document.querySelector<HTMLElement>('[data-account-initials]')!;
    avatar.textContent = initials(me.user.name, me.user.email);
    if (me.user.image) {
      const img = document.createElement('img');
      img.src = me.user.image;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => img.remove());
      avatar.replaceChildren(img);
    }
    document.querySelector('[data-account-name]')!.textContent = me.user.name || me.user.email;
    document.querySelector('[data-account-mail]')!.textContent = me.user.email;
  }

  /** The admin link only appears for admins (the usage endpoint 404s for everyone else). */
  function showAdminLink(me: MeDto) {
    loadIsAdmin(me.user.id).then((admin) => {
      document.querySelector<HTMLElement>('[data-admin-link]')!.hidden = !admin;
    });
  }

  window.addEventListener('sendm8:email-settings-changed', () => {
    invalidate('email-settings');
    refreshUsage();
  });

  const signOut = document.querySelector<HTMLButtonElement>('[data-signout]')!;
  signOut.addEventListener('click', async () => {
    signOut.disabled = true;
    try {
      await api.signOut();
    } catch {
      /* already signed out is fine */
    }
    window.location.href = '/';
  });

  return { show, refreshUsage, showAdminLink };
}
