import { computed, nextTick, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue';
import type { EmailSettingsDto } from '@sendm8/shared';
import { api } from '../../../lib/api/endpoints';
import { errorCode, fieldError, friendlyError } from '../../../lib/api/errors';
import { toast } from '../../../lib/toast';
import { checkFrom, checkKeyFormat } from './resendRules';

interface ResendKeyOptions {
  settings: Ref<EmailSettingsDto | null>;
  byok: ComputedRef<EmailSettingsDto['byok'] | null>;
  limit: ComputedRef<number>;
  loadDomains: () => void;
  announceSettings: () => void;
}

/**
 * Connecting, replacing and removing the account's Resend key. The key form comes and goes,
 * so what's typed into it lives here.
 */
export function useResendKey({ settings, byok, limit, loadDomains, announceSettings }: ResendKeyOptions) {
  /** Key form: shown when there's no key yet, or when replacing one. */
  const replacing = ref(false);
  const checking = ref(false);
  const key = ref('');
  const show = ref(false);
  const formatError = ref('');
  const from = ref('');
  const fromError = ref('');
  const apiError = ref<null | { title: string; body: string }>(null);
  const checkStep = ref(0);
  const confirmRemove = ref(false);
  const removing = ref(false);
  const justVerified = ref(false);
  const restricted = ref(false);

  const connected = computed(() => Boolean(byok.value?.configured) && !replacing.value);

  const timers: number[] = [];
  onBeforeUnmount(() => timers.forEach(clearTimeout));

  async function connect() {
    if (checking.value) return;
    const v = key.value.trim();
    const f = from.value.trim();
    apiError.value = null;
    formatError.value = checkKeyFormat(v);
    fromError.value = checkFrom(f);
    if (formatError.value || fromError.value) {
      await nextTick();
      document.getElementById(formatError.value ? 'rk-key' : 'rk-from')?.focus();
      return;
    }
    checking.value = true;
    checkStep.value = 1;
    timers.push(window.setTimeout(() => checking.value && (checkStep.value = 2), 350));
    timers.push(window.setTimeout(() => checking.value && (checkStep.value = 3), 900));
    try {
      const result = await api.putResend(v, f);
      checkStep.value = 4;
      restricted.value = Boolean(result.restricted);
      settings.value = await api.emailSettings();
      loadDomains();
      key.value = '';
      show.value = false;
      replacing.value = false;
      justVerified.value = true;
      announceSettings();
      toast('Key verified. You’re on unlimited email.');
      nextTick(() => document.getElementById('rk-verified-title')?.focus());
    } catch (err) {
      const code = errorCode(err);
      const fe = fieldError(err);
      if (code === 'validation_failed' && fe.field === 'from') fromError.value = fe.message;
      else if (code === 'validation_failed' && fe.field === 'apiKey') formatError.value = fe.message;
      else if (code === 'resend_key_invalid') apiError.value = { title: 'Resend didn’t accept that', body: `${fe.message} Nothing was saved.` };
      else apiError.value = { title: 'Couldn’t check the key', body: `${fe.message} Nothing was saved.` };
      await nextTick();
      document.getElementById(fromError.value && !formatError.value ? 'rk-from' : 'rk-key')?.focus();
    } finally {
      checking.value = false;
      checkStep.value = 0;
    }
  }

  async function startReplace() {
    replacing.value = true;
    apiError.value = null;
    from.value = byok.value?.from ?? from.value;
    await nextTick();
    document.getElementById('rk-key')?.focus();
  }
  async function cancelReplace() {
    replacing.value = false;
    key.value = '';
    formatError.value = '';
    fromError.value = '';
    apiError.value = null;
    await nextTick();
    document.getElementById('rk-verified-title')?.focus();
  }

  async function askRemove() {
    confirmRemove.value = true;
    await nextTick();
    document.getElementById('rk-keep')?.focus();
  }
  async function keepKey() {
    confirmRemove.value = false;
    await nextTick();
    document.getElementById('rk-remove')?.focus();
  }
  async function removeKey() {
    if (removing.value) return;
    removing.value = true;
    try {
      await api.deleteResend();
      settings.value = await api.emailSettings();
      confirmRemove.value = false;
      justVerified.value = false;
      apiError.value = null;
      announceSettings();
      toast(`Key removed. You’re back on our sender, ${limit.value} instant emails a day.`);
      await nextTick();
      document.getElementById('rk-key')?.focus();
    } catch (err) {
      toast(`Couldn’t remove the key: ${friendlyError(err)}`);
    } finally {
      removing.value = false;
    }
  }

  return {
    replacing,
    connected,
    checking,
    key,
    show,
    formatError,
    from,
    fromError,
    apiError,
    checkStep,
    confirmRemove,
    removing,
    justVerified,
    connect,
    startReplace,
    cancelReplace,
    askRemove,
    keepKey,
    removeKey,
  };
}
