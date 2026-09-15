/** Tiny toast: announces through the page's polite live region. */
export function toast(message: string, ms = 2200) {
  const region = document.querySelector<HTMLElement>('[data-toasts]');
  if (!region) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  region.appendChild(el);
  window.setTimeout(() => el.remove(), ms);
}
