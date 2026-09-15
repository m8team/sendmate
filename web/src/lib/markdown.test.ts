import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inline, renderMarkdown, slug } from './markdown';

describe('inline', () => {
  it('escapes HTML first', () => {
    expect(inline('<script>alert(1)</script> & "x"')).toBe('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
  });

  it('renders code, bold, italic and links', () => {
    expect(inline('Use `sendm8.com/f/<id>` **now**, _really_.')).toBe('Use <code>sendm8.com/f/&lt;id&gt;</code> <strong>now</strong>, <em>really</em>.');
    expect(inline('[docs](/docs) and [AGPL](https://gnu.org)')).toBe('<a href="/docs">docs</a> and <a href="https://gnu.org" rel="noopener">AGPL</a>');
  });

  it('drops unsafe link targets but keeps the text', () => {
    expect(inline('[click](javascript:alert(1))')).toBe('click)');
  });

  it('does not italicise snake_case words or touch code', () => {
    expect(inline('field card_number and `_gotcha`')).toBe('field card_number and <code>_gotcha</code>');
  });

  it('highlights placeholders as TODOs, braces and all', () => {
    expect(inline('by {{OPERATOR NAME}}')).toBe('by <mark class="todo" title="To fill in before launch">{{OPERATOR NAME}}</mark>');
  });
});

describe('renderMarkdown', () => {
  it('handles headings, lists, tables, paragraphs and comments', () => {
    const md = [
      '<!-- TEMPLATE: review me -->',
      '# Terms',
      '',
      'First line',
      'continues here.',
      '',
      '## The service',
      '- one',
      '  still one',
      '- **two**',
      '',
      '### Detail',
      '| Provider | What for |',
      '|---|---|',
      '| Cloudflare | Hosting |',
      '| Resend |',
      '',
      '## The service',
    ].join('\r\n');
    const r = renderMarkdown(md);
    expect(r.title).toBe('Terms');
    expect(r.notes).toEqual(['TEMPLATE: review me']);
    expect(r.sections).toEqual([
      { id: 'the-service', title: 'The service' },
      { id: 'the-service-2', title: 'The service' },
    ]);
    expect(r.html).toContain('<p>First line continues here.</p>');
    expect(r.html).toContain('<ul><li>one still one</li><li><strong>two</strong></li></ul>');
    expect(r.html).toContain('<h3 id="detail">Detail</h3>');
    expect(r.html).toContain('<th scope="col">Provider</th>');
    expect(r.html).toContain('<td>Resend</td><td></td>');
  });

  it('renders the real legal documents with every detail filled in', () => {
    for (const name of ['terms', 'privacy']) {
      const src = readFileSync(new URL(`../../../docs/legal/${name}.md`, import.meta.url), 'utf8');
      const r = renderMarkdown(src);
      expect(r.title).toMatch(/Terms|Privacy/);
      expect(r.sections.length).toBeGreaterThan(3);
      // sendm8.com publishes these, so a leftover {{PLACEHOLDER}} would go live as a draft notice.
      expect(r.placeholders).toEqual([]);
      expect(r.html).not.toMatch(/<!--|\{\{|<mark class="todo"/);
    }
  });

  it('slugs headings', () => {
    expect(slug('Who processes data for us')).toBe('who-processes-data-for-us');
    expect(slug('!!!')).toBe('section');
  });
});
