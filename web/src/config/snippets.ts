import { site } from './site';

export const ENDPOINT = `${site.endpointBase}you@example.com`;

export const setupTabs = (endpoint = ENDPOINT) => [
  {
    label: 'HTML',
    lang: 'html',
    filename: 'contact.html',
    highlight: [1],
    code: `
<form action="${endpoint}" method="POST">
  <label>Email <input name="email" type="email" required></label>
  <label>Message <textarea name="message"></textarea></label>
  <button>Send</button>
</form>`,
  },
  {
    label: 'React',
    lang: 'jsx',
    filename: 'ContactForm.jsx',
    highlight: [3],
    code: `
export function ContactForm() {
  return (
    <form action="${endpoint}" method="POST">
      <input name="email" type="email" required />
      <textarea name="message" />
      <button>Send</button>
    </form>
  );
}`,
  },
  {
    label: 'Vue',
    lang: 'vue',
    filename: 'ContactForm.vue',
    highlight: [2],
    code: `
<template>
  <form action="${endpoint}" method="POST">
    <input name="email" type="email" required />
    <textarea name="message" />
    <button>Send</button>
  </form>
</template>`,
  },
  {
    label: 'Astro',
    lang: 'astro',
    filename: 'src/components/Contact.astro',
    highlight: [4],
    code: `
---
const endpoint = "${endpoint}";
---
<form action={endpoint} method="POST">
  <input name="email" type="email" required />
  <textarea name="message" />
  <button>Send</button>
</form>`,
  },
  {
    label: 'Next.js',
    lang: 'tsx',
    filename: 'app/contact/page.tsx',
    highlight: [4],
    code: `
export default function Contact() {
  // Plain HTML post: works with JavaScript off, no API route needed
  return (
    <form action="${endpoint}" method="POST">
      <input name="email" type="email" required />
      <textarea name="message" />
      <button>Send</button>
    </form>
  );
}`,
  },
];

export const ajaxSnippet = (endpoint = `${site.endpointBase}k3x9q2m7ab`) => `
const form = document.querySelector("#contact");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const res = await fetch("${endpoint}", {
    method: "POST",
    body: new FormData(form),
    headers: { Accept: "application/json" },
  });
  const result = await res.json();
  if (result.ok) form.replaceWith("Thanks! It's on its way.");
  else alert(result.error.message);
});`;
