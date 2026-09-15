import { nextTick, onBeforeUnmount, onMounted, reactive, ref, type Ref } from 'vue';
import { api } from '../../../lib/api/endpoints';
import { clipText } from '../../../lib/api/adapters';
import { friendlyError } from '../../../lib/api/errors';
import { toast } from '../../../lib/toast';
import type { Channel } from '../../../lib/api/types';
import { chanState, validateRename, type ChanState } from './channelHelpers';

interface ChannelOptions {
  /** Test emails through our sender count towards today's budget. */
  byok: Ref<boolean>;
  used: Ref<number>;
}

/** The form's channels as routing slips: test, rename, switch on/off, remove, rotate secrets. */
export function useChannels(initial: Channel[], { byok, used }: ChannelOptions) {
  const chans = reactive<ChanState[]>(initial.map((c) => chanState(c)));

  /** Keeps "2 min ago" on test results fresh. */
  const clock = ref(Date.now());
  let clockTimer = 0;
  onMounted(() => (clockTimer = window.setInterval(() => (clock.value = Date.now()), 30_000)));
  onBeforeUnmount(() => window.clearInterval(clockTimer));

  async function sendTest(c: ChanState) {
    if (c.testing) return;
    c.testing = true;
    c.announce = `Sending a test to ${c.label}…`;
    try {
      await api.testChannel(c.id);
      c.lastTest = { at: Date.now(), ok: true, message: c.type === 'email' ? 'Test email sent' : 'Delivered' };
      c.announce = `Test to ${c.label} worked.`;
      if (c.type === 'email' && !byok.value) used.value++;
    } catch (err) {
      c.lastTest = { at: Date.now(), ok: false, message: clipText(friendlyError(err)) };
      c.announce = `Test to ${c.label} failed: ${c.lastTest.message}`;
    } finally {
      clock.value = Date.now();
      c.testing = false;
    }
  }

  async function startRename(c: ChanState) {
    c.renaming = true;
    c.renameDraft = c.label;
    c.renameError = '';
    await nextTick();
    (document.getElementById(`fs-rename-${c.id}`) as HTMLInputElement | null)?.select();
  }
  async function stopRename(c: ChanState) {
    c.renaming = false;
    c.renameError = '';
    await nextTick();
    document.getElementById(`fs-rename-btn-${c.id}`)?.focus();
  }
  async function saveRename(c: ChanState) {
    const label = c.renameDraft.trim();
    c.renameError = validateRename(label);
    if (c.renameError) return;
    if (label === c.label) return stopRename(c);
    c.busy = true;
    try {
      const dto = await api.updateChannel(c.id, { label });
      c.label = dto.label;
      toast(`Renamed to ${dto.label}.`);
      await stopRename(c);
    } catch (err) {
      c.renameError = friendlyError(err);
    } finally {
      c.busy = false;
    }
  }

  async function toggleChannel(c: ChanState) {
    const on = c.enabled;
    c.busy = true;
    try {
      await api.updateChannel(c.id, { enabled: on });
      toast(on ? `${c.label} is on. It’ll get the next submission.` : `${c.label} is off. Nothing will be sent there.`);
    } catch (err) {
      c.enabled = !on;
      toast(`Couldn’t switch ${c.label} ${on ? 'on' : 'off'}: ${friendlyError(err)}`);
    } finally {
      c.busy = false;
    }
  }

  async function removeChannel(c: ChanState) {
    c.busy = true;
    try {
      await api.deleteChannel(c.id);
      const i = chans.indexOf(c);
      if (i >= 0) chans.splice(i, 1);
      toast(`Removed ${c.label}.`);
      nextTick(() => document.getElementById('fs-add-channel')?.focus());
    } catch (err) {
      c.busy = false;
      c.confirmRemove = false;
      toast(`Couldn’t remove it: ${friendlyError(err)}`);
    }
  }
  async function askRemove(c: ChanState) {
    c.confirmRemove = true;
    await nextTick();
    document.getElementById(`fs-keep-${c.id}`)?.focus();
  }
  async function keep(c: ChanState) {
    c.confirmRemove = false;
    await nextTick();
    document.getElementById(`fs-remove-${c.id}`)?.focus();
  }

  async function rotate(c: ChanState) {
    if (c.busy) return;
    c.busy = true;
    try {
      const dto = await api.rotateSecret(c.id);
      c.secret = dto.secret;
      c.reveal = true;
      toast('New signing secret made. The old one stopped working just now.');
    } catch (err) {
      toast(`Couldn’t rotate the secret: ${friendlyError(err)}`);
    } finally {
      c.busy = false;
    }
  }

  return { chans, clock, sendTest, startRename, stopRename, saveRename, toggleChannel, removeChannel, askRemove, keep, rotate };
}
