/**
 * The quickstart's sections, in order. Drives the sidebar, the "Bay 01" numbers, the anchors, and the
 * Markdown docs for AI assistants (/llms.txt), where `summary` describes each section.
 */
import { site } from '../../../config/site';

export const docsSections = [
  { id: 'basic-form', title: 'The basic form', summary: 'Point an HTML form at your endpoint, with examples for React, Vue, Astro and Next.js.' },
  { id: 'zero-signup', title: 'No signup: email in the URL', summary: 'Use /f/you@example.com with no account, confirm once by email, and claim the form later.' },
  { id: 'fields', title: 'Special fields', summary: 'Formspree-compatible underscore fields: _replyto, _subject, _next, _gotcha and _cc.' },
  { id: 'ajax', title: 'AJAX / fetch', summary: 'Submit with fetch and Accept: application/json. Response shapes and every HTTP status code.' },
  { id: 'ajax-helper', title: 'AJAX without writing JavaScript', summary: 'The /s/v1.js helper: data-sendm8 attributes, success and error messages, and events.' },
  { id: 'redirects', title: 'Redirects & thank-you page', summary: 'Where visitors land after a normal post, and why _next must be on an allowed domain.' },
  { id: 'spam', title: 'Spam protection', summary: 'Honeypots, automatic spam scoring, Turnstile challenges and allowed domains.' },
  { id: 'uploads', title: 'File uploads', summary: 'Accept files with multipart forms, size limits, and how files reach you.' },
  { id: 'discord', title: 'Connect Discord', summary: 'Send submissions to a Discord channel with a webhook.' },
  { id: 'byok', title: 'Connect Resend (BYOK)', summary: 'Send notification emails from your own domain with your own Resend API key.' },
  { id: 'webhooks', title: 'Webhooks', summary: 'Receive submissions as signed JSON: payload, signature verification and retries.' },
  { id: 'formspree', title: 'Moving from Formspree', summary: 'Migrate existing Formspree forms: URL changes, fetch and React code, and a prompt for AI assistants.' },
] as const;

export type DocsSectionId = (typeof docsSections)[number]['id'];

/** Id, bay number and title for a section heading. */
export const sec = (id: DocsSectionId) => {
  const i = docsSections.findIndex((s) => s.id === id);
  return { id, no: i + 1, title: docsSections[i].title };
};

/** The example form endpoint used in every code sample. */
export const FORM = `${site.endpointBase}k3x9q2m7ab`;
