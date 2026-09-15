import { reactive } from 'vue';
import { friendlyError } from '../../../lib/api/errors';
import { toast } from '../../../lib/toast';

/**
 * Runs an admin action once at a time per key, toasting the outcome.
 * `busy[key]` drives the button's aria-disabled while it runs.
 */
export function useAdminAction() {
  const busy = reactive<Record<string, boolean>>({});

  async function run(key: string, work: () => Promise<unknown>, done: string) {
    if (busy[key]) return false;
    busy[key] = true;
    try {
      await work();
      toast(done);
      return true;
    } catch (err) {
      toast(friendlyError(err));
      return false;
    } finally {
      busy[key] = false;
    }
  }

  return { busy, run };
}
