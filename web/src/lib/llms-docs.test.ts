import { describe, expect, it } from 'vitest';
import { docsSections } from '../components/docs/sections/docsSections';
import { docsToMarkdown, renderLlmsFullTxt, renderLlmsTxt, renderSectionMarkdown, type SiteInfo } from './llms-docs';

const site: SiteInfo = {
  name: 'sendm8',
  url: 'https://sendm8.com',
  description: 'A free form backend.',
  endpointBase: 'https://sendm8.com/f/',
  repo: 'https://github.com/m8team/sendmate',
};

/** Trimmed-down markup in the shape the real docs page renders. */
const page = `<!doctype html><html><body>
<nav><a href="#basic">Skip me</a></nav>
<article class="docs-body">
  <section class="ds" id="basic">
    <header class="dh"><p class="dh-kicker label"><span class="dh-no">Bay 01</span><span aria-hidden="true">·</span>Kicker</p>
      <h2 class="dh-title"><a class="dh-anchor" href="#basic">#</a>The basic form</h2></header>
    <div class="prose"><p>Point any form at <code>/f/you@example.com</code>. See <a href="#ajax">AJAX</a> or <a href="/pricing">pricing</a> and <strong>go</strong>.</p>
      <ul><li><strong>Fast</strong>: no setup.<ul><li>Nested</li></ul></li><li>Second</li></ul></div>
    <div class="codeblock codetabs" data-tabs>
      <div class="cb-head"><div class="cb-tablist" role="tablist"><button class="cb-tab">HTML</button><button class="cb-tab">verify.js</button></div>
        <button class="copy-btn"><svg></svg><span>Copy code</span></button></div>
      <div role="tabpanel" class="cb-panel"><div class="cb-file label">contact.html</div><div class="cb-body"><pre data-language="html"><code><span class="line">&lt;form&gt;</span>
<span class="line">&lt;/form&gt;</span></code></pre></div></div>
      <div role="tabpanel" class="cb-panel"><div class="cb-file label">verify.js</div><div class="cb-body"><pre data-language="js"><code><span class="line">const a = "\`\`\`";</span></code></pre></div></div>
    </div>
    <figure class="codeblock"><figcaption class="cb-head"><span class="cb-name">prompt.txt</span><button>Copy</button></figcaption><div class="cb-body"><pre data-language="plaintext"><code>Do the thing</code></pre></div></figure>
    <aside class="notice callout"><span class="notice-icon"><svg></svg></span><p class="notice-title">Fields need a name</p><div class="notice-body"><p>Use <code>name</code>.</p><p>Second line.</p></div></aside>
  </section>
  <section class="ds" id="details">
    <header class="dh"><h2 class="dh-title">Details</h2></header>
    <h3 class="ds-h3"><span class="ds-h3-no">3a</span>Status codes</h3>
    <div class="table-wrap"><table class="table"><caption class="sr-only">Codes</caption><thead><tr><th>Status</th><th>Means</th></tr></thead>
      <tbody><tr><th scope="row">200</th><td>Stored | safe</td></tr><tr><th>404</th><td class="no-alias"><span class="sr-only">None</span><span aria-hidden="true">–</span></td></tr></tbody></table></div>
    <ol class="journey"><li><span class="j-no">1</span><div><h3>Someone submits</h3><p>It is stored.</p></div></li><li><span class="j-no">2</span><div><h3>We email you</h3><p>Once.</p></div></li></ol>
    <dl class="caps"><div><dt>Per file</dt><dd>5 MB</dd></div><div><dt>Too big</dt><dd>413</dd></div></dl>
    <figure class="dc" aria-label="Example Discord message"><div class="dc-avatar" aria-hidden="true">m8</div><p class="dc-meta">sendm8 APP</p>
      <div class="dc-embed"><p>New submission</p><dl><div><dt>name</dt><dd>Ada</dd></div></dl></div></figure>
    <p>Line one<br>line two</p>
    <a class="next-card" href="/app">Create a form</a>
  </section>
</article></body></html>`;

describe('docsToMarkdown', () => {
  const [basic, details] = docsToMarkdown(page, 'https://sendm8.com/docs');

  it('splits the page into sections with their titles', () => {
    expect(basic).toMatchObject({ id: 'basic', title: 'The basic form' });
    expect(details).toMatchObject({ id: 'details', title: 'Details' });
    expect(basic!.markdown).not.toContain('Bay 01');
    expect(basic!.markdown).not.toContain('Skip me');
  });

  it('converts prose, inline code, absolute links and nested lists', () => {
    expect(basic!.markdown).toContain(
      'Point any form at `/f/you@example.com`. See [AJAX](https://sendm8.com/docs#ajax) or [pricing](https://sendm8.com/pricing) and **go**.',
    );
    expect(basic!.markdown).toContain('- **Fast**: no setup.\n   - Nested\n- Second');
  });

  it('turns code tabs and code blocks into labelled fences, without copy buttons', () => {
    expect(basic!.markdown).toContain('**HTML: `contact.html`**\n\n```html\n<form>\n</form>\n```');
    // A label that repeats the filename isn't doubled, and code containing ``` gets a longer fence.
    expect(basic!.markdown).toContain('**verify.js**\n\n````js\nconst a = "```";\n````');
    expect(basic!.markdown).toContain('`prompt.txt`\n\n```\nDo the thing\n```');
    expect(basic!.markdown).not.toContain('Copy');
  });

  it('turns callouts into quotes', () => {
    expect(basic!.markdown).toContain('> **Fields need a name**\n>\n> Use `name`.\n>\n> Second line.');
  });

  it('converts headings, tables, step lists, definition lists and the Discord mock-up', () => {
    const md = details!.markdown;
    expect(md).toContain('### Status codes');
    expect(md).toContain('| Status | Means |\n| --- | --- |\n| 200 | Stored \\| safe |\n| 404 | None |');
    expect(md).not.toContain('Codes');
    expect(md).toContain('1. **Someone submits**\n\n   It is stored.\n2. **We email you**\n\n   Once.');
    expect(md).toContain('- **Per file**: 5 MB\n- **Too big**: 413');
    expect(md).toContain('_Example Discord message:_\n\n> New submission\n>\n> - **name**: Ada');
    expect(md).not.toContain('sendm8 APP');
    expect(md).toContain('Line one\nline two');
    expect(md).toContain('[Create a form](https://sendm8.com/app)');
  });
});

describe('rendered files', () => {
  const sections = docsToMarkdown(page, 'https://sendm8.com/docs').map((s) => ({ ...s, summary: `About ${s.title}` }));

  it('writes an llmstxt.org index with key facts and a link per section', () => {
    const txt = renderLlmsTxt(site, sections);
    expect(txt.startsWith('# sendm8\n\n> A free form backend.')).toBe(true);
    expect(txt).toContain('`POST https://sendm8.com/f/{formId}`');
    expect(txt).toContain('{ "ok": false, "error": { "code": "…", "message": "…" } }');
    expect(txt).toContain('- [The basic form](https://sendm8.com/docs/basic.md): About The basic form');
    expect(txt).toContain('- [All docs in one file](https://sendm8.com/llms-full.txt)');
    expect(txt).toContain('## Optional');
  });

  it('writes the full file with section headings nested one level down', () => {
    const full = renderLlmsFullTxt(site, sections);
    expect(full).toContain('## The basic form\n\nPoint any form');
    expect(full).toContain('#### Status codes');
    expect(full).toContain('\n\n---\n\n## Details');
  });

  it('writes a standalone file per section', () => {
    expect(renderSectionMarkdown(site, sections[0]!)).toMatch(/^# The basic form\n\nPart of the sendm8 docs: https:\/\/sendm8.com\/docs#basic\./);
  });

  it('has a summary for every docs section', () => {
    for (const section of docsSections) expect(section.summary.length, section.id).toBeGreaterThan(20);
  });
});
