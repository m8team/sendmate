/**
 * Star, spam, not-spam and retry, for one submission or a bulk pick.
 * Optimistic: the UI changes straight away and rolls back with a toast if the call fails.
 */
import { computed, ref, type Ref } from 'vue';
import type { Submission } from '../../../lib/api/types';
import { api, bulkAll } from '../../../lib/api/endpoints';
import { friendlyError } from '../../../lib/api/errors';
import { toast } from '../../../lib/toast';
import { sender } from '../InboxUtils';
import { plural, rescueMessage, retryMessage } from './rows';
import type { Submissions } from './useSubmissions';

export function useSubmissionActions(list: Submissions, opts: { formId: () => string; spamRetentionDays: () => number; releasedId: Ref<string | null> }) {
  const { selected, visibleIds, byId, load, refreshCounts, syncUnread, noteRead, replaceItem, refreshItem } = list;
  const { releasedId } = opts;

  /* ---- Single actions ----------------------------------------------------- */
  async function toggleStar(s: Submission) {
    const on = !s.starred;
    s.starred = on;
    try {
      await api.updateSubmission(s.id, { starred: on });
      refreshCounts();
      toast(on ? `Starred ${sender(s)}` : 'Star removed');
    } catch (err) {
      s.starred = !on;
      toast(`Couldn’t ${on ? 'star' : 'unstar'} it: ${friendlyError(err)}`);
    }
  }

  async function markSpam(s: Submission) {
    if (s.status === 'held') return toast('Held submissions can’t be moved to spam. Delete it if it isn’t yours.');
    const prev = s.status;
    s.status = 'spam';
    try {
      await api.updateSubmission(s.id, { status: 'spam' });
      toast(`Moved to spam. It’ll be binned in ${opts.spamRetentionDays()} days.`);
      syncUnread();
      refreshCounts();
    } catch (err) {
      s.status = prev;
      toast(`Couldn’t move it to spam: ${friendlyError(err)}`);
    }
  }

  async function release(s: Submission) {
    if (s.status === 'held') return toast('Held submissions stay put until they’ve been reviewed. You can star or delete it.');
    const prev = s.status;
    s.status = 'ok';
    releasedId.value = s.id;
    const neverDelivered = s.deliveries.length === 0;
    try {
      const dto = await api.updateSubmission(s.id, { status: 'ok' });
      replaceItem(dto);
      toast(neverDelivered ? 'Rescued. Back in your inbox and queued for delivery to your channels.' : 'Not spam. It’s back in your inbox.');
      syncUnread();
      refreshCounts();
      // Delivery runs in the background: fetch it again shortly so the journey fills in.
      if (neverDelivered) window.setTimeout(() => refreshItem(s.id), 2500);
    } catch (err) {
      s.status = prev;
      releasedId.value = null;
      toast(`Couldn’t move it: ${friendlyError(err)}`);
    }
  }

  /* ---- Retry deliveries now ----------------------------------------------- */
  const retryingId = ref<string | null>(null);
  async function retry(s: Submission) {
    if (retryingId.value) return;
    retryingId.value = s.id;
    try {
      const dto = await api.retrySubmission(s.id);
      replaceItem(dto);
      toast(retryMessage(dto.deliveries.filter((d) => d.status === 'failed' || d.status === 'skipped').length));
    } catch (err) {
      toast(`Couldn’t retry: ${friendlyError(err)}`);
    } finally {
      retryingId.value = null;
    }
  }

  /* ---- Selection & bulk ---------------------------------------------------- */
  const selectedInView = computed(() => selected.value.filter((id) => visibleIds.value.includes(id)));
  const allSelected = computed(() => visibleIds.value.length > 0 && selectedInView.value.length === visibleIds.value.length);
  const someSelected = computed(() => selectedInView.value.length > 0 && !allSelected.value);
  const bulkItems = computed(() => selectedInView.value.map(byId).filter((s): s is Submission => !!s));
  const bulkAllStarred = computed(() => bulkItems.value.length > 0 && bulkItems.value.every((s) => s.starred));
  const bulkAllBlocked = computed(() => bulkItems.value.length > 0 && bulkItems.value.every((s) => s.status === 'spam' || s.status === 'held'));
  const bulkBusy = ref(false);

  function toggleSelect(id: string) {
    selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id];
  }
  function toggleAll() {
    selected.value = allSelected.value ? [] : [...visibleIds.value];
  }

  function bulkRead() {
    const n = bulkItems.value.length;
    noteRead(bulkItems.value);
    selected.value = [];
    toast(`Marked ${plural(n)} as read`);
  }

  async function runBulk(targets: Submission[], action: 'star' | 'unstar' | 'spam' | 'not_spam', apply: (s: Submission) => void, done: (n: number) => string) {
    if (!targets.length || bulkBusy.value) return;
    const snapshot = targets.map((s) => ({ s, starred: s.starred, status: s.status }));
    targets.forEach(apply);
    selected.value = [];
    bulkBusy.value = true;
    try {
      await bulkAll(
        opts.formId(),
        targets.map((s) => s.id),
        action,
      );
      toast(done(targets.length));
      refreshCounts();
      syncUnread();
    } catch (err) {
      snapshot.forEach(({ s, starred, status }) => {
        s.starred = starred;
        s.status = status;
      });
      toast(`That didn’t work: ${friendlyError(err)}`);
    } finally {
      bulkBusy.value = false;
    }
  }

  function bulkStar() {
    const on = !bulkAllStarred.value;
    runBulk(
      bulkItems.value,
      on ? 'star' : 'unstar',
      (s) => (s.starred = on),
      (n) => (on ? `Starred ${plural(n)}` : `Unstarred ${plural(n)}`),
    );
  }
  function bulkSpam() {
    const held = bulkItems.value.filter((s) => s.status === 'held').length;
    const heldNote = held ? ` Held ones stay put.` : '';
    if (bulkAllBlocked.value) {
      const targets = bulkItems.value.filter((s) => s.status === 'spam');
      if (!targets.length) return toast('Held submissions stay put until they’ve been reviewed.');
      const undelivered = targets.filter((s) => s.deliveries.length === 0).length;
      runBulk(
        targets,
        'not_spam',
        (s) => (s.status = 'ok'),
        (n) => rescueMessage(n, undelivered, heldNote),
      );
      if (undelivered) window.setTimeout(() => load(), 3000);
    } else {
      const targets = bulkItems.value.filter((s) => s.status !== 'held' && s.status !== 'spam');
      runBulk(targets, 'spam', (s) => (s.status = 'spam'), (n) => `Moved ${plural(n)} to spam.${heldNote}`);
    }
  }

  return {
    toggleStar,
    markSpam,
    release,
    retryingId,
    retry,
    selectedInView,
    allSelected,
    someSelected,
    bulkAllStarred,
    bulkAllBlocked,
    bulkBusy,
    toggleSelect,
    toggleAll,
    bulkRead,
    bulkStar,
    bulkSpam,
  };
}
