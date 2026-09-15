/**
 * Talks to the export menu in the topbar (ExportMenu.astro, outside this island):
 * it sends `sendm8:export` with the format, and we tell it what's in view with `sendm8:inbox-view`.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { download, exportAll, exportFilename } from '../../../lib/api/export';
import { friendlyError } from '../../../lib/api/errors';
import { toast } from '../../../lib/toast';
import { FILTER_LABEL, apiFilter, exportScopeNote } from './folders';
import { plural } from './rows';
import type { Submissions } from './useSubmissions';

export function useInboxExport(list: Submissions, form: () => { id: string; name: string }) {
  const { filter, appliedQuery, folderCounts } = list;
  const exporting = ref(false);

  async function exportAs(kind: 'csv' | 'json') {
    if (exporting.value) return;
    exporting.value = true;
    const f = apiFilter(filter.value);
    toast(`Packing ${FILTER_LABEL[f].toLowerCase()}${appliedQuery.value ? ' (search results)' : ''} as ${kind.toUpperCase()}…`);
    try {
      const result = await exportAll(form().id, kind, f, appliedQuery.value);
      if (result.rows === 0) {
        toast('Nothing in this view to export');
        return;
      }
      download(exportFilename(form().name, f, kind), result.content, result.mime);
      toast(result.rows === null ? `Exported as ${kind.toUpperCase()}` : `Exported ${plural(result.rows)} as ${kind.toUpperCase()}`);
    } catch (err) {
      toast(`Export failed: ${friendlyError(err)}`);
    } finally {
      exporting.value = false;
    }
  }

  function announceView() {
    const note = exportScopeNote(filter.value, appliedQuery.value, folderCounts.value);
    window.dispatchEvent(new CustomEvent('sendm8:inbox-view', { detail: { note } }));
  }
  watch([filter, appliedQuery, folderCounts], announceView);

  function onExport(e: Event) {
    const kind = (e as CustomEvent<'csv' | 'json'>).detail;
    if (kind === 'csv' || kind === 'json') exportAs(kind);
  }
  onMounted(() => window.addEventListener('sendm8:export', onExport));
  onBeforeUnmount(() => window.removeEventListener('sendm8:export', onExport));

  return { announceView };
}
