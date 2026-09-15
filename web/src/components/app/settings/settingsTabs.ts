/** The form settings tab rail: which tabs exist, and how the keyboard moves between them. */
export const tabs = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'channels', label: 'Channels', icon: 'send' },
  { id: 'spam', label: 'Spam', icon: 'shield' },
  { id: 'danger', label: 'Danger zone', icon: 'alert' },
] as const;

export type TabId = (typeof tabs)[number]['id'];

/** Index of the tab a key press moves to (ARIA tabs pattern), or null when the key isn't a tab key. */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (key === 'ArrowDown' || key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowUp' || key === 'ArrowLeft') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** The tab a URL hash like `#spam` points at, if any. */
export function tabFromHash(hash: string): TabId | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  return tabs.find((t) => t.id === h)?.id ?? null;
}
