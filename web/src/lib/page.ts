/** Small DOM helpers so client-side islands can update the static Astro shell around them. */

/** Replace a breadcrumb's text (and link, if it has one) by its position. */
export function setCrumb(index: number, label: string, href?: string) {
  const el = document.querySelector<HTMLElement>(`[data-crumb="${index}"]`);
  if (!el) return;
  el.textContent = label;
  if (href && el instanceof HTMLAnchorElement) el.href = href;
}

export function setTitle(title: string) {
  document.title = `${title} · sendm8`;
}

/** The topbar's "Copy endpoint" button (`data-form-endpoint`) copies this form's endpoint once it's known. */
export function hydrateEndpoint(endpoint: string) {
  document.querySelectorAll<HTMLElement>('[data-form-endpoint]').forEach((btn) => {
    btn.dataset.copy = endpoint;
    btn.hidden = false;
  });
}

/** Links marked `data-form-href="/settings"` become `/app/forms/<id>/settings`. */
export function hydrateFormLinks(formId: string) {
  document.querySelectorAll<HTMLAnchorElement>('a[data-form-href]').forEach((a) => {
    a.href = `/app/forms/${formId}${a.dataset.formHref ?? ''}`;
    a.removeAttribute('aria-disabled');
  });
}
