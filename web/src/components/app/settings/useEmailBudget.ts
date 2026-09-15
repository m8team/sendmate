import { computed, ref, type Ref } from 'vue';
import type { EmailSettingsDto } from '@sendm8/shared';
import { hourLabel } from '../SettingsChannelRules';
import { usagePct } from './settingsHelpers';

/**
 * Today's instant-email budget. `used` can run ahead of the real count: sending a test email
 * bumps it, and "Preview what happens at the cap" pushes it past the limit.
 */
export function useEmailBudget(emailSettings: Ref<EmailSettingsDto | null>, limits: () => { digestHourUtc: number; instantEmailsPerDay: number }) {
  const used = ref(0);
  const realUsed = computed(() => emailSettings.value?.usage.instantToday ?? 0);
  const emailLimit = computed(() => emailSettings.value?.usage.instantLimit ?? limits().instantEmailsPerDay);
  const byok = computed(() => Boolean(emailSettings.value?.byok.configured && emailSettings.value.byok.healthy));
  const simulating = computed(() => used.value !== realUsed.value);
  const pct = computed(() => usagePct(used.value, emailLimit.value));
  const overCap = computed(() => used.value >= emailLimit.value);
  const digestAt = computed(() => hourLabel(emailSettings.value?.digestHourUtc ?? limits().digestHourUtc));

  function toggleCapPreview() {
    used.value = simulating.value ? realUsed.value : emailLimit.value + 2;
  }

  return { used, realUsed, emailLimit, byok, simulating, pct, overCap, digestAt, toggleCapPreview };
}
