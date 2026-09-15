/**
 * Fills the rail's pigeonhole list (RailPigeonholes.astro) from the API: one link per form,
 * each with an unread badge, kept in step with `sendm8:forms-changed` and `sendm8:unread-changed`.
 */
import type { FormDto } from '@sendm8/shared';
import { friendlyError } from '../../../lib/api/errors';
import { formIdFromPath } from '../../../lib/api/session';
import { FORMS_CHANGED, UNREAD_CHANGED, invalidate, loadForms, unreadFor } from '../../../lib/api/store';
import { unreadBadge } from './railFormat';

export function mountPigeonholes() {
  const holes = document.querySelector<HTMLUListElement>('[data-holes]')!;
  const tpl = document.querySelector<HTMLTemplateElement>('[data-hole-tpl]')!;
  const activeForm = formIdFromPath(location.pathname);
  const counts = new Map<string, HTMLElement>();

  function setCount(formId: string, count: number, more = false) {
    const el = counts.get(formId);
    if (!el) return;
    const badge = unreadBadge(count, more);
    el.hidden = badge.hidden;
    el.textContent = badge.text;
    el.setAttribute('aria-label', badge.label);
  }

  function render(forms: FormDto[]) {
    holes.querySelectorAll('[data-hole-skel], [data-hole]').forEach((el) => el.remove());
    holes.querySelector<HTMLElement>('[data-holes-error]')!.hidden = true;
    holes.querySelector<HTMLElement>('[data-holes-empty]')!.hidden = forms.length > 0;
    counts.clear();
    const frag = document.createDocumentFragment();
    for (const f of forms) {
      const li = tpl.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
      li.dataset.hole = f.id;
      const a = li.querySelector<HTMLAnchorElement>('a')!;
      a.href = `/app/forms/${f.id}`;
      if (f.id === activeForm) a.setAttribute('aria-current', 'page');
      li.querySelector('.hole-dot')!.classList.add(`s-${f.status}`);
      li.querySelector('.hole-name')!.textContent = f.name;
      counts.set(f.id, li.querySelector<HTMLElement>('.hole-count')!);
      frag.appendChild(li);
    }
    holes.prepend(frag);
    holes.removeAttribute('aria-busy');
  }

  async function loadUnread(forms: FormDto[]) {
    const queue = [...forms];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try {
          const u = await unreadFor(f);
          setCount(f.id, u.count, u.more);
        } catch {
          /* counts are a nicety; the inbox still works */
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  async function refresh() {
    try {
      const forms = await loadForms();
      render(forms);
      loadUnread(forms);
    } catch (err) {
      holes.querySelectorAll('[data-hole-skel]').forEach((el) => el.remove());
      holes.removeAttribute('aria-busy');
      const box = holes.querySelector<HTMLElement>('[data-holes-error]')!;
      box.hidden = false;
      box.title = friendlyError(err);
    }
  }

  document.querySelector('[data-holes-retry]')?.addEventListener('click', () => {
    invalidate('forms');
    refresh();
  });
  window.addEventListener(FORMS_CHANGED, () => refresh());
  window.addEventListener(UNREAD_CHANGED, (e) => {
    const { formId, count, more } = (e as CustomEvent<{ formId: string; count: number; more: boolean }>).detail;
    setCount(formId, count, more);
  });

  return { refresh };
}
