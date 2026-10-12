# @sendm8/react

React hooks for [sendm8](https://sendm8.com), the free, open-source form backend. Same API as `@formspree/react`, so moving over is usually two lines.

```sh
npm install @sendm8/react
```

```jsx
import { useForm, ValidationError } from "@sendm8/react";

export function ContactForm() {
  const [state, handleSubmit] = useForm("k3x9q2m7ab"); // your sendm8 form id, or your email address

  if (state.succeeded) return <p>Thanks! It's on its way.</p>;

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" required />
      <textarea name="message" required />
      <ValidationError errors={state.errors} />
      <button disabled={state.submitting}>Send</button>
    </form>
  );
}
```

## Moving from Formspree

```diff
- import { useForm, ValidationError } from "@formspree/react";
+ import { useForm, ValidationError } from "@sendm8/react";

- const [state, handleSubmit] = useForm("xyzabcde");
+ const [state, handleSubmit] = useForm("k3x9q2m7ab");
```

`state.submitting`, `state.succeeded`, `state.errors` (with `getFormErrors()` and `getFieldErrors()`), `reset` and `<ValidationError>` all work the same. Field names like `_replyto`, `_subject` and `_gotcha` are the same too.

One difference: sendm8 reports a single form-level error (like "This form has reached its monthly submission limit") rather than per-field errors, so put a `<ValidationError errors={state.errors} />` without a `field` somewhere in your form.

## API

### `useForm(formKey, options?)`

Returns `[state, handleSubmit, reset]`.

- `formKey`: a form id from your dashboard, an email address (a [no-signup endpoint](https://sendm8.com/docs/zero-signup)), or a full endpoint URL.
- `options.data`: extra fields to send with every submission. Values can be functions, called at submit time.
- `options.endpoint`: where your sendm8 runs, if you self-host. Defaults to `https://sendm8.com`.

`handleSubmit` takes a form submit event, or `FormData`, or a plain object. Files in the form are sent too.

`state` is `{ submitting, succeeded, errors, result }`. On success, `result.id` is the submission's id in your dashboard.

### `<ValidationError errors field? prefix? />`

Renders the errors from `state.errors` in a `role="alert"` element, or nothing. Other props go on the element.

### `submit(url, data)`

The same thing without React, if you need it: resolves to `{ ok: true, result }` or `{ ok: false, error }`.

## Licence

MIT. sendm8 itself is AGPL-3.0, but this client is MIT so you can use it in any project.
