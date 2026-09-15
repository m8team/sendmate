/**
 * The quickstart's sections, in order. Drives the sidebar, the "Bay 01" numbers and the anchors.
 */
import { site } from '../../../config/site';

export const docsSections = [
  { id: 'basic-form', title: 'The basic form' },
  { id: 'zero-signup', title: 'No signup: email in the URL' },
  { id: 'fields', title: 'Special fields' },
  { id: 'ajax', title: 'AJAX / fetch' },
  { id: 'ajax-helper', title: 'AJAX without writing JavaScript' },
  { id: 'redirects', title: 'Redirects & thank-you page' },
  { id: 'spam', title: 'Spam protection' },
  { id: 'uploads', title: 'File uploads' },
  { id: 'discord', title: 'Connect Discord' },
  { id: 'byok', title: 'Connect Resend (BYOK)' },
  { id: 'webhooks', title: 'Webhooks' },
] as const;

export type DocsSectionId = (typeof docsSections)[number]['id'];

/** Id, bay number and title for a section heading. */
export const sec = (id: DocsSectionId) => {
  const i = docsSections.findIndex((s) => s.id === id);
  return { id, no: i + 1, title: docsSections[i].title };
};

/** The example form endpoint used in every code sample. */
export const FORM = `${site.endpointBase}k3x9q2m7ab`;
