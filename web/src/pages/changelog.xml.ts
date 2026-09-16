import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { changelog } from '../config/changelog';
import { site } from '../config/site';

export const GET: APIRoute = () =>
  rss({
    title: 'sendm8 changelog',
    description: 'What shipped on sendm8, in one place: features, fixes and the odd bit of housekeeping.',
    site: site.url,
    items: [...changelog]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((entry) => ({
        title: entry.title,
        pubDate: new Date(`${entry.date}T00:00:00Z`),
        description: entry.summary,
        // A fully-qualified URL (not a relative path) so @astrojs/rss uses it verbatim — its
        // relative-link handling force-appends a trailing slash after the string, landing after
        // the #fragment and breaking the anchor.
        link: `${site.url}/changelog#${entry.slug}`,
        categories: entry.tags,
      })),
    customData: '<language>en-gb</language>',
  });
