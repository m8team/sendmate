import { describe, expect, it } from 'vitest';
import { nextTabIndex, tabFromHash, tabs } from './settingsTabs';

describe('nextTabIndex', () => {
  const n = tabs.length;

  it('moves forward with ArrowDown and ArrowRight, wrapping at the end', () => {
    expect(nextTabIndex('ArrowDown', 0, n)).toBe(1);
    expect(nextTabIndex('ArrowRight', 1, n)).toBe(2);
    expect(nextTabIndex('ArrowDown', n - 1, n)).toBe(0);
  });

  it('moves back with ArrowUp and ArrowLeft, wrapping at the start', () => {
    expect(nextTabIndex('ArrowUp', 2, n)).toBe(1);
    expect(nextTabIndex('ArrowLeft', 0, n)).toBe(n - 1);
  });

  it('jumps to the ends with Home and End', () => {
    expect(nextTabIndex('Home', 3, n)).toBe(0);
    expect(nextTabIndex('End', 0, n)).toBe(n - 1);
  });

  it('ignores other keys', () => {
    expect(nextTabIndex('Enter', 0, n)).toBeNull();
    expect(nextTabIndex('a', 0, n)).toBeNull();
  });
});

describe('tabFromHash', () => {
  it('finds the tab a hash names', () => {
    expect(tabFromHash('#spam')).toBe('spam');
    expect(tabFromHash('#danger')).toBe('danger');
  });

  it('returns null for empty or unknown hashes', () => {
    expect(tabFromHash('')).toBeNull();
    expect(tabFromHash('#')).toBeNull();
    expect(tabFromHash('#billing')).toBeNull();
  });
});
