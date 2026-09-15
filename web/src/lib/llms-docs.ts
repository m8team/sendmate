/**
 * Docs for AI assistants, built from the rendered /docs page so the two can never drift apart.
 * The build (src/integrations/llms-docs.ts) turns dist/docs/index.html into:
 *   /llms.txt        an index in the llmstxt.org format
 *   /llms-full.txt   every section in one Markdown file
 *   /docs/<id>.md    one Markdown file per section
 */
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['childNode'] | DefaultTreeAdapterMap['document'];
type Element = DefaultTreeAdapterMap['element'];

export interface DocsSectionMarkdown {
  id: string;
  title: string;
  markdown: string;
}

export interface SiteInfo {
  name: string;
  url: string;
  description: string;
  endpointBase: string;
  repo: string;
}

// ── Tree helpers ────────────────────────────────────────────────────────────

const isElement = (node: Node): node is Element => 'tagName' in node;
const attr = (el: Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
const classes = (el: Element) => (attr(el, 'class') ?? '').split(/\s+/).filter(Boolean);
const hasClass = (el: Element, name: string) => classes(el).includes(name);
const children = (node: Node): Node[] => ('childNodes' in node ? node.childNodes : []);
const elements = (node: Node) => children(node).filter(isElement);

function textOf(node: Node): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  return children(node).map(textOf).join('');
}

function find(node: Node, test: (el: Element) => boolean): Element | undefined {
  for (const child of elements(node)) {
    if (test(child)) return child;
    const found = find(child, test);
    if (found) return found;
  }
  return undefined;
}

function findAll(node: Node, test: (el: Element) => boolean, out: Element[] = []): Element[] {
  for (const child of elements(node)) {
    if (test(child)) out.push(child);
    else findAll(child, test, out);
  }
  return out;
}

/** UI chrome with nothing to read: icons, copy buttons, tab strips, heading anchors, avatars. */
function isChrome(el: Element): boolean {
  if (['svg', 'button', 'script', 'style', 'template', 'caption'].includes(el.tagName)) return true;
  if (attr(el, 'aria-hidden') === 'true') return true;
  return ['dh-anchor', 'notice-icon', 'cb-tablist', 'copy-btn', 'ds-h3-no', 'j-no', 'dc-meta', 'dc-avatar'].some((c) => hasClass(el, c));
}

// ── Inline ──────────────────────────────────────────────────────────────────

const BLOCK_TAGS = new Set(['p', 'ul', 'ol', 'dl', 'table', 'pre', 'figure', 'aside', 'div', 'section', 'header', 'footer', 'h2', 'h3', 'h4', 'blockquote']);

function codeSpan(text: string): string {
  const fence = text.includes('`') ? '``' : '`';
  return `${fence}${text}${fence}`;
}

function inline(node: Node, base: string): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value.replace(/\s+/g, ' ');
  if (!isElement(node)) return '';
  if (isChrome(node)) return '';
  const inner = () => children(node).map((c) => inline(c, base)).join('');
  switch (node.tagName) {
    case 'code':
      return codeSpan(textOf(node));
    case 'strong':
    case 'b': {
      const text = inner().trim();
      return text ? `**${text}**` : '';
    }
    case 'em':
    case 'i': {
      const text = inner().trim();
      return text ? `_${text}_` : '';
    }
    case 'br':
      return '\n';
    case 'a': {
      const text = inner().trim();
      const href = attr(node, 'href');
      return href && text ? `[${text}](${absolute(href, base)})` : text;
    }
    default:
      return inner();
  }
}

/** Links work anywhere the Markdown ends up: in-page anchors and site paths become full URLs. */
function absolute(href: string, base: string): string {
  if (/^[a-z]+:/i.test(href)) return href;
  return new URL(href, base).toString();
}

const tidy = (text: string) => text.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/ {2,}/g, ' ').trim();

// ── Blocks ──────────────────────────────────────────────────────────────────

function codeFence(pre: Element, label?: string): string {
  const lang = attr(pre, 'data-language') ?? '';
  const code = textOf(pre).replace(/^\n+|\s+$/g, '');
  const fence = code.includes('```') ? '````' : '```';
  const heading = label ? `${label}\n\n` : '';
  return `${heading}${fence}${lang === 'plaintext' || lang === 'text' ? '' : lang}\n${code}\n${fence}`;
}

const quote = (content: string) => content.split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n');

/** A list. Nesting comes from the parent item, which indents everything after its first line. */
function list(el: Element, base: string): string {
  const ordered = el.tagName === 'ol';
  return elements(el)
    .filter((li) => li.tagName === 'li')
    .map((li, i) => {
      const marker = ordered ? `${i + 1}.` : '-';
      let content = '';
      let text = '';
      const add = (part: string, separator: string) => {
        if (part) content += (content ? separator : '') + part;
      };
      const flushText = () => {
        add(tidy(text), '\n\n');
        text = '';
      };
      for (const child of children(li)) {
        if (isElement(child) && (child.tagName === 'ul' || child.tagName === 'ol')) {
          flushText();
          add(list(child, base), '\n');
        } else if (isElement(child) && BLOCK_TAGS.has(child.tagName)) {
          flushText();
          add(blocks(child, base, true).join('\n\n'), '\n\n');
        } else {
          text += inline(child, base);
        }
      }
      flushText();
      const [first = '', ...rest] = content.split('\n');
      return [`${marker} ${first}`, ...rest.map((line) => (line ? `   ${line}` : ''))].join('\n');
    })
    .join('\n');
}

function table(el: Element, base: string): string {
  const rows = findAll(el, (n) => n.tagName === 'tr').map((tr) =>
    elements(tr)
      .filter((cell) => cell.tagName === 'td' || cell.tagName === 'th')
      .map((cell) => tidy(children(cell).map((c) => inline(c, base)).join('')).replace(/\|/g, '\\|').replace(/\n/g, ' ') || ' '),
  );
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? ' ').join(' | ')} |`;
  const [head, ...body] = rows;
  return [line(head!), line(Array(width).fill('---')), ...body.map(line)].join('\n');
}

/** `inList`: inside a list item, where a Markdown heading would break the list, so headings become bold text. */
function blocks(node: Node, base: string, inList = false): string[] {
  const out: string[] = [];
  let pending = '';
  const flush = () => {
    if (pending.trim()) out.push(tidy(pending));
    pending = '';
  };

  for (const child of children(node)) {
    if (!isElement(child)) {
      pending += inline(child, base);
      continue;
    }
    if (isChrome(child)) continue;
    const el = child;
    const tag = el.tagName;

    if (!BLOCK_TAGS.has(tag) && !['li', 'dt', 'dd'].includes(tag)) {
      pending += inline(el, base);
      continue;
    }
    flush();

    if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const text = tidy(inline(el, base));
      out.push(inList ? `**${text}**` : `${'#'.repeat(Number(tag[1]))} ${text}`);
    } else if (tag === 'p') {
      const text = tidy(children(el).map((c) => inline(c, base)).join(''));
      if (text) out.push(text);
    } else if (tag === 'ul' || tag === 'ol') out.push(list(el, base));
    else if (tag === 'dl') {
      const items: string[] = [];
      for (const item of elements(el)) {
        const pair = item.tagName === 'div' ? elements(item) : [item];
        for (const part of pair) {
          const text = tidy(inline(part, base));
          if (!text) continue;
          if (part.tagName === 'dt') items.push(`- **${text}**`);
          else if (part.tagName === 'dd') items[items.length - 1] = `${items.at(-1) ?? '-'}: ${text}`;
        }
      }
      out.push(items.join('\n'));
    } else if (tag === 'table') out.push(table(el, base));
    else if (tag === 'pre') out.push(codeFence(el));
    else if (tag === 'aside' && hasClass(el, 'notice')) {
      const title = find(el, (n) => hasClass(n, 'notice-title'));
      const body = find(el, (n) => hasClass(n, 'notice-body'));
      const content = [title ? `**${tidy(inline(title, base))}**` : '', ...(body ? blocks(body, base) : [])].filter(Boolean).join('\n\n');
      out.push(quote(content));
    } else if (hasClass(el, 'dc')) {
      // The Discord mock-up: its label, then the message itself as a quote.
      const embed = find(el, (n) => hasClass(n, 'dc-embed'));
      out.push(`_${attr(el, 'aria-label') ?? 'Example message'}:_`, quote(embed ? blocks(embed, base).join('\n\n') : ''));
    } else if (hasClass(el, 'codetabs')) {
      const labels = findAll(el, (n) => hasClass(n, 'cb-tab')).map((b) => tidy(textOf(b)));
      findAll(el, (n) => hasClass(n, 'cb-panel')).forEach((panel, i) => {
        const file = find(panel, (n) => hasClass(n, 'cb-file'));
        const pre = find(panel, (n) => n.tagName === 'pre');
        const fileName = file ? tidy(textOf(file)) : '';
        const name = [labels[i], fileName && fileName !== labels[i] && `\`${fileName}\``].filter(Boolean).join(': ');
        if (pre) out.push(codeFence(pre, name ? `**${name}**` : undefined));
      });
    } else if (hasClass(el, 'codeblock')) {
      const file = find(el, (n) => hasClass(n, 'cb-name'));
      const pre = find(el, (n) => n.tagName === 'pre');
      if (pre) out.push(codeFence(pre, file ? `\`${tidy(textOf(file))}\`` : undefined));
    } else if (tag === 'a') {
      pending += inline(el, base);
    } else {
      out.push(...blocks(el, base, inList));
    }
  }
  flush();
  return out.filter(Boolean);
}

// ── Documents ───────────────────────────────────────────────────────────────

/** Splits the rendered docs page into one Markdown document per section. */
export function docsToMarkdown(html: string, pageUrl: string): DocsSectionMarkdown[] {
  const doc = parse(html);
  return findAll(doc, (el) => el.tagName === 'section' && hasClass(el, 'ds') && Boolean(attr(el, 'id'))).map((section) => {
    const id = attr(section, 'id')!;
    const heading = find(section, (el) => el.tagName === 'h2');
    const title = heading ? tidy(inline(heading, pageUrl)) : id;
    const body = elements(section).filter((el) => el.tagName !== 'header');
    const markdown = body.flatMap((el) => blocks({ nodeName: 'div', tagName: 'div', attrs: [], childNodes: [el] } as unknown as Element, pageUrl)).join('\n\n');
    return { id, title, markdown };
  });
}

const sectionUrl = (site: SiteInfo, id: string) => `${site.url}/docs/${id}.md`;

function preamble(site: SiteInfo): string {
  return `# ${site.name}

> ${site.description}

Key facts:

- Endpoint: \`POST ${site.endpointBase}{formId}\`, or \`POST ${site.endpointBase}{email}\` with no account (the owner confirms once by email).
- Send \`Accept: application/json\` to get JSON back. Success: \`{ "ok": true, "id": "…" }\`. Failure: \`{ "ok": false, "error": { "code": "…", "message": "…" } }\` with a 4xx or 5xx status.
- Special fields match Formspree: \`_replyto\` (or \`email\`), \`_subject\`, \`_next\`, \`_gotcha\`, \`_cc\`.
- Forms are created by a person in the dashboard at ${site.url}/app. There's no API key for creating forms.`;
}

/** The llmstxt.org index: what sendm8 is, the key facts, and a link to each section. */
export function renderLlmsTxt(site: SiteInfo, sections: (DocsSectionMarkdown & { summary?: string })[]): string {
  const links = sections.map((s) => `- [${s.title}](${sectionUrl(site, s.id)})${s.summary ? `: ${s.summary}` : ''}`);
  return `${preamble(site)}

## Docs

${links.join('\n')}
- [All docs in one file](${site.url}/llms-full.txt): every section above, in order.

## Optional

- [Self-hosting](${site.repo}/blob/main/docs/self-hosting.md): run your own copy on Cloudflare.
- [Webhook payloads and signatures](${site.repo}/blob/main/docs/webhooks.md)
- [Pricing and fair-use limits](${site.url}/pricing)
`;
}

export function renderSectionMarkdown(site: SiteInfo, section: DocsSectionMarkdown): string {
  return `# ${section.title}

Part of the ${site.name} docs: ${site.url}/docs#${section.id}. Index for AI assistants: ${site.url}/llms.txt

${section.markdown}
`;
}

export function renderLlmsFullTxt(site: SiteInfo, sections: DocsSectionMarkdown[]): string {
  const body = sections.map((s) => `## ${s.title}\n\n${s.markdown.replace(/^(#{2,5}) /gm, '#$1 ')}`).join('\n\n---\n\n');
  return `${preamble(site)}

Human-readable version: ${site.url}/docs

${body}
`;
}
