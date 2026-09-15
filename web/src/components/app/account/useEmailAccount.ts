/**
 * Shared state for /app/account/email. ResendKey.vue creates it; the key panel, the usage panel
 * and the recipients list inject it.
 */
import { computed, inject, onMounted, provide, ref, type InjectionKey } from 'vue';
import type { EmailAddressDto, EmailSettingsDto, MeDto } from '@sendm8/shared';
import { api } from '../../../lib/api/endpoints';
import { friendlyError } from '../../../lib/api/errors';
import { guardSession } from '../../../lib/api/session';
import { invalidate } from '../../../lib/api/store';
import { hourLabel } from '../SettingsChannelRules';
import { usagePct } from '../settings/settingsHelpers';
import { useResendKey } from './useResendKey';
import { useSenderPicker } from './useSenderPicker';

function createContext() {
  const loading = ref(true);
  const loadError = ref('');
  const me = ref<MeDto | null>(null);
  const settings = ref<EmailSettingsDto | null>(null);
  const addresses = ref<EmailAddressDto[]>([]);

  const byok = computed(() => settings.value?.byok ?? null);
  const healthy = computed(() => Boolean(byok.value?.configured && byok.value.healthy));
  const used = computed(() => settings.value?.usage.instantToday ?? 0);
  const limit = computed(() => settings.value?.usage.instantLimit ?? 0);
  const digestAt = computed(() => hourLabel(settings.value?.digestHourUtc ?? 18));
  const pct = computed(() => usagePct(used.value, limit.value));
  const left = computed(() => Math.max(0, limit.value - used.value));
  const senderName = computed(() => me.value?.user.name || 'You');
  const fromPlaceholder = computed(() => `${senderName.value} <forms@yourdomain.com>`);

  /** Tells the rest of the page (and the rail) that email settings changed. */
  function announceSettings() {
    invalidate('email-settings');
    window.dispatchEvent(new CustomEvent('sendm8:email-settings-changed'));
  }

  const sender = useSenderPicker(settings, byok);
  const resendKey = useResendKey({ settings, byok, limit, loadDomains: sender.loadDomains, announceSettings });

  async function load() {
    loading.value = true;
    loadError.value = '';
    try {
      me.value = await guardSession();
      if (!me.value) return;
      const [s, emails] = await Promise.all([api.emailSettings(), api.listEmails()]);
      settings.value = s;
      addresses.value = emails;
      if (!resendKey.from.value) resendKey.from.value = s.byok.from ?? '';
      if (s.byok.configured) sender.loadDomains();
    } catch (err) {
      loadError.value = friendlyError(err);
    } finally {
      loading.value = false;
    }
  }
  onMounted(load);

  return { loading, loadError, load, me, addresses, byok, healthy, used, limit, digestAt, pct, left, senderName, fromPlaceholder, sender, resendKey };
}

export type EmailAccountContext = ReturnType<typeof createContext>;

const KEY: InjectionKey<EmailAccountContext> = Symbol('email-account');

export function provideEmailAccount() {
  const ctx = createContext();
  provide(KEY, ctx);
  return ctx;
}

export function useEmailAccount(): EmailAccountContext {
  const ctx = inject(KEY);
  if (!ctx) throw new Error('useEmailAccount() needs a ResendKey ancestor');
  return ctx;
}
